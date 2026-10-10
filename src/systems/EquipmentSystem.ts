/**
 * @module systems/EquipmentSystem
 * 장비 장착(equip) 및 해제(unequip) 요청을 처리하는 시스템.
 *
 * 처리 프로세스:
 * 1. 장착 요청 (EquipRequest):
 *    - 인벤토리에 해당 아이템이 존재하는지 확인
 *    - DataManager/ItemRegistry에서 아이템 정의(ItemDef) 조회
 *    - ConstraintChecker를 통해 착용 제약(레벨, 직업 등) 검사
 *    - 기존 슬롯 장착 아이템이 있으면 해제 및 인벤토리로 환원
 *    - 인벤토리에서 장착할 아이템 1개 차감
 *    - EquipmentComponent 슬롯에 장착
 *    - 장비의 스펙(attack, defense, maxHp 등)을 StatMod로 변환하여 StatModsComponent에 자동 등록
 *    - 'equipment:equipped' 이벤트 발행
 *
 * 2. 해제 요청 (UnequipRequest):
 *    - 해당 슬롯에 장착된 아이템 조회
 *    - 인벤토리가 가득 차 있지 않은지 확인
 *    - EquipmentComponent 슬롯에서 제거
 *    - 관련 StatMod 자동 제거
 *    - 인벤토리에 아이템 1개 환원
 *    - 'equipment:unequipped' 이벤트 발행
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { EquipmentComponent, EquipSlot } from '../components/EquipmentComponent';
import { InventoryComponent } from '../components/InventoryComponent';
import { StatModsComponent, ModifiableStat } from '../components/StatModsComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';
import { DataManager } from '../data/DataManager';
import { ConstraintChecker } from '../constraints/ConstraintChecker';

import { StatModSystem } from './StatModSystem';

export interface EquipRequest {
  entityId: number;
  slot: EquipSlot;
  itemId: string | number;
}

export interface UnequipRequest {
  entityId: number;
  slot: EquipSlot;
}

export class EquipmentSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [EquipmentComponent];

  private _pendingEquip: EquipRequest[] = [];
  private _pendingUnequip: UnequipRequest[] = [];

  readonly data: DataManager;
  readonly constraintChecker: ConstraintChecker;
  statModSystem?: StatModSystem;

  constructor(
    data: DataManager = new DataManager(),
    constraintChecker?: ConstraintChecker,
    statModSystem?: StatModSystem,
  ) {
    super();
    this.data = data;
    this.constraintChecker = constraintChecker ?? new ConstraintChecker();
    this.statModSystem = statModSystem;
  }

  requestEquip(req: EquipRequest): void {
    this._pendingEquip.push(req);
  }

  requestUnequip(req: UnequipRequest): void {
    this._pendingUnequip.push(req);
  }

  update(entities: Entity[], _delta: number): void {
    if (this._pendingEquip.length === 0 && this._pendingUnequip.length === 0) return;

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    // 1. 해제 요청 처리
    for (const req of this._pendingUnequip) {
      this._processUnequip(req, entityMap);
    }
    this._pendingUnequip = [];

    // 2. 장착 요청 처리
    for (const req of this._pendingEquip) {
      this._processEquip(req, entityMap);
    }
    this._pendingEquip = [];
  }

  private _processEquip(req: EquipRequest, entityMap: Map<number, Entity>): void {
    const entity = entityMap.get(req.entityId);
    if (!entity) return;

    const eq = entity.get(EquipmentComponent);
    const inv = entity.get(InventoryComponent);
    if (!eq || !inv) return;

    // 1. 인벤토리 소지 여부
    if (!inv.has(req.itemId, 1)) {
      this.bus.emit('equipment:failed', {
        entityId: req.entityId,
        slot: req.slot,
        itemId: req.itemId,
        reason: 'not_in_inventory',
      });
      return;
    }

    // 2. 아이템 정의 조회
    const itemDef = this.data.items.get(req.itemId);
    if (!itemDef) {
      this.bus.emit('equipment:failed', {
        entityId: req.entityId,
        slot: req.slot,
        itemId: req.itemId,
        reason: 'invalid_item',
      });
      return;
    }

    // 3. 제약조건 검사
    if (itemDef.constraints && itemDef.constraints.length > 0) {
      const result = this.constraintChecker.check(entity, itemDef.constraints);
      if (!result.ok) {
        this.bus.emit('equipment:failed', {
          entityId: req.entityId,
          slot: req.slot,
          itemId: req.itemId,
          reason: 'constraint_failed',
          details: result.reason,
        });
        return;
      }
    }

    // 4. 장착 교체 처리 (먼저 새 장비를 인벤토리에서 차감하고 기존 장비를 환원)
    const prevItem = eq.getSlot(req.slot);
    if (prevItem) {
      this._removeEquipMods(entity, req.slot);
      eq.unequip(req.slot);
    }

    inv.remove(req.itemId, 1);

    if (prevItem) {
      inv.add(prevItem.defId, 1);
      this.bus.emit('equipment:unequipped', {
        entityId: req.entityId,
        slot: req.slot,
        itemId: prevItem.defId,
      });
    }

    // 5. 슬롯에 장착
    eq.equip(req.slot, {
      defId: req.itemId,
      weaponType: itemDef.spec?.weaponType as string | undefined,
      elements: itemDef.spec?.elements as string[] | undefined,
    });

    // 6. 스탯 모디파이어 적용
    this._applyEquipMods(entity, req.slot, itemDef.spec);

    this.bus.emit('equipment:equipped', {
      entityId: req.entityId,
      slot: req.slot,
      itemId: req.itemId,
    });
  }

  private _processUnequip(req: UnequipRequest, entityMap: Map<number, Entity>): void {
    const entity = entityMap.get(req.entityId);
    if (!entity) return;

    const eq = entity.get(EquipmentComponent);
    const inv = entity.get(InventoryComponent);
    if (!eq) return;

    const current = eq.getSlot(req.slot);
    if (!current) return;

    // 인벤토리가 존재하고 꽉 찼으면 해제 불가
    if (inv && inv.isFull) {
      this.bus.emit('equipment:failed', {
        entityId: req.entityId,
        slot: req.slot,
        itemId: current.defId,
        reason: 'inventory_full',
      });
      return;
    }

    // 1. 슬롯에서 제거 & 모디파이어 제거
    eq.unequip(req.slot);
    this._removeEquipMods(entity, req.slot);

    // 2. 인벤토리에 환원
    if (inv) {
      inv.add(current.defId, 1);
    }

    this.bus.emit('equipment:unequipped', {
      entityId: req.entityId,
      slot: req.slot,
      itemId: current.defId,
    });
  }

  private _applyEquipMods(
    entity: Entity,
    slot: EquipSlot,
    spec?: Record<string, unknown>,
  ): void {
    if (!spec) return;
    const modsComp = entity.get(StatModsComponent);
    const extStats = entity.get(ExtendedStatsComponent);

    // 메타데이터 속성 제외하고 모든 숫자형 스탯을 동적으로 반영 (str, dex, matk, critRate 등 임의 스탯 지원)
    const excludedKeys = new Set([
      'weaponType',
      'armorType',
      'slot',
      'category',
      'itemLevel',
      'price',
      'rarity',
      'icon',
      'reqLevel',
    ]);

    for (const [stat, val] of Object.entries(spec)) {
      if (excludedKeys.has(stat)) continue;
      if (typeof val === 'number' && val !== 0) {
        const sourceId = `equip:${slot}:${stat}`;
        if (modsComp) {
          modsComp.add({
            sourceId,
            stat,
            flat: val,
          });
        }
        if (extStats) {
          extStats.addModifier({
            sourceId,
            stat,
            flat: val,
          });
        }

        this.bus.emit('stat_mod:added', {
          entityId: entity.id,
          sourceId,
          stat,
          flat: val,
        });
      }
    }
  }

  private _removeEquipMods(entity: Entity, slot: EquipSlot): void {
    const modsComp = entity.get(StatModsComponent);
    const extStats = entity.get(ExtendedStatsComponent);

    const prefix = `equip:${slot}:`;
    if (modsComp) {
      const toRemove = modsComp.all.filter((m) => m.sourceId.startsWith(prefix));
      for (const mod of toRemove) {
        modsComp.remove(mod.sourceId);
        this.bus.emit('stat_mod:removed', {
          entityId: entity.id,
          sourceId: mod.sourceId,
          stat: mod.stat,
        });
      }
    }

    if (extStats) {
      extStats.removeModifiersBySource(prefix);
    }
  }
}

