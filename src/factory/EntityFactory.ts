/**
 * @module factory/EntityFactory
 * 데이터 블루프린트(Blueprint)를 기반으로 World 내 Entity를 자동 조립 및 스폰하는 팩토리.
 *
 * 기본 컴포넌트(Identity, Stats, Skills, Inventory, Equipment)를 자동으로 부착하며,
 * 외부 프로젝트에서 등록한 커스텀 컴포넌트 핸들러를 통해 무한히 확장 가능하다.
 */

import { World } from '../core/World';
import { Entity } from '../core/Entity';
import { DataManager } from '../data/DataManager';
import { EntityBlueprint, SpawnOptions } from './Blueprint';
import { IdentityComponent } from '../components/IdentityComponent';
import { StatsComponent, Stats } from '../components/StatsComponent';
import { SkillsComponent } from '../components/SkillsComponent';
import { InventoryComponent } from '../components/InventoryComponent';
import { EquipmentComponent, EquipSlot, EquippedItem } from '../components/EquipmentComponent';
import { ItemDefComponent } from '../components/ItemDefComponent';
import { SkillDef } from '../skills/SkillDef';

export interface FactoryContext {
  world: World<any>;
  data: DataManager;
  blueprint: EntityBlueprint;
  options?: SpawnOptions;
}

export type CustomComponentHandler = (
  entity: Entity,
  config: unknown,
  context: FactoryContext,
) => void;

export class EntityFactory {
  readonly world: World<any>;
  readonly data: DataManager;
  private _handlers: Map<string, CustomComponentHandler> = new Map();

  constructor(world: World<any>, data: DataManager) {
    this.world = world;
    this.data = data;
  }

  /**
   * 커스텀 컴포넌트 핸들러 등록.
   * 블루프린트의 `custom[key]` 데이터를 받아 엔티티에 컴포넌트를 조립할 때 호출된다.
   */
  registerComponentHandler(key: string, handler: CustomComponentHandler): this {
    this._handlers.set(key, handler);
    return this;
  }

  /**
   * 블루프린트 ID를 기반으로 엔티티를 생성하고 월드에 등록한다.
   * @param blueprintId 블루프린트 등록 ID
   * @param options 런타임 오버라이드 옵션 (이름, 추가 스탯, 태그, 스킬 등)
   */
  spawn(blueprintId: string, options?: SpawnOptions): Entity {
    const bp = this.data.blueprints.getOrThrow(blueprintId);

    // 1. 태그 결합
    const tagSet = new Set<string>([...(bp.tags ?? []), ...(options?.tags ?? [])]);
    const tags = Array.from(tagSet);

    // 2. 엔티티 생성
    const entity = this.world.createEntity(...tags);

    // 3. IdentityComponent
    if (bp.identity || options?.name) {
      const name = options?.name ?? bp.identity?.name ?? bp.id;
      const idx = bp.identity?.idx ?? entity.id;
      const description = bp.identity?.description ?? '';
      entity.add(new IdentityComponent(idx, name, description));
    }

    // 4. StatsComponent
    if (bp.stats || options?.overrideStats) {
      const mergedStats: Partial<Stats> = {
        ...(bp.stats ?? {}),
        ...(options?.overrideStats ?? {}),
      };
      entity.add(new StatsComponent(mergedStats));
    }

    // 5. SkillsComponent
    const skillIdSet = new Set<string>([
      ...(bp.skills ?? []),
      ...(options?.extraSkills ?? []),
    ]);
    if (skillIdSet.size > 0 || bp.skills !== undefined) {
      const learnedDefs: SkillDef[] = [];
      for (const sid of skillIdSet) {
        const def = this.data.skills.get(sid);
        if (def) {
          learnedDefs.push(def);
        } else {
          console.warn(`[EntityFactory] Skill '${sid}' not found in SkillRegistry while spawning '${blueprintId}'.`);
        }
      }
      entity.add(new SkillsComponent(learnedDefs));
    }

    // 6. InventoryComponent
    const allInventory = [
      ...(bp.inventory ?? []),
      ...(options?.extraInventory ?? []),
    ];
    if (allInventory.length > 0 || bp.inventory !== undefined) {
      const inv = new InventoryComponent();
      for (const entry of allInventory) {
        inv.add(entry.itemId, entry.count ?? 1);
      }
      entity.add(inv);
    }

    // 7. EquipmentComponent
    if (bp.equipment) {
      const eq = new EquipmentComponent();
      for (const [slot, itemId] of Object.entries(bp.equipment)) {
        if (!itemId) continue;
        const itemDef = this.data.items.get(itemId);
        const equipped: EquippedItem = {
          defId: itemId,
          weaponType: itemDef?.spec?.weaponType as string | undefined,
          elements: itemDef?.spec?.elements as string[] | undefined,
        };
        eq.equip(slot as EquipSlot, equipped);
      }
      entity.add(eq);
    }

    // 8. Custom 컴포넌트 핸들러 호출
    const mergedCustom: Record<string, unknown> = {
      ...(bp.custom ?? {}),
      ...(options?.custom ?? {}),
    };

    const context: FactoryContext = {
      world: this.world,
      data: this.data,
      blueprint: bp,
      options,
    };

    for (const [key, config] of Object.entries(mergedCustom)) {
      const handler = this._handlers.get(key);
      if (handler) {
        handler(entity, config, context);
      }
    }

    // 9. 스폰 이벤트 알림
    this.world.bus.emit('entity:spawned', {
      entityId: entity.id,
      blueprintId,
      tags,
    });

    return entity;
  }

  /**
   * 아이템 정의(ItemDef)를 기반으로 월드 상의 아이템 엔티티(바닥 드랍 등)를 생성한다.
   */
  createItemEntity(
    itemId: string | number,
    options?: { tags?: string[]; stackLimit?: number },
  ): Entity {
    const itemDef = this.data.items.getOrThrow(itemId);
    const tags = ['item', ...(options?.tags ?? [])];
    const entity = this.world.createEntity(...tags);

    entity.add(
      new ItemDefComponent({
        id: itemDef.id,
        name: itemDef.name,
        category: itemDef.category,
        stackLimit: options?.stackLimit ?? itemDef.stackLimit,
        value: itemDef.value,
        spec: itemDef.spec,
        description: itemDef.description,
        constraints: itemDef.constraints,
      }),
    );

    return entity;
  }
}
