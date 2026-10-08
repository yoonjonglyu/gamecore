/**
 * @module systems/LootSystem
 * 엔티티 사망 시 전리품(드랍 아이템 및 처치 경험치)을 산출하고 수령자에게 지급하는 시스템.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { LootComponent } from '../components/LootComponent';
import { InventoryComponent } from '../components/InventoryComponent';
import { ProgressionSystem } from './ProgressionSystem';

export interface ProcessLootRequest {
  deadEntityId: number;
  receiverId?: number;
}

export class LootSystem extends System<CoreEvents> {
  /**
   * query = [] -> 수령자(플레이어)와 전리품 소유자(몬스터)를 동시에 조회해야 하므로
   * 전체 엔티티를 받는다.
   */
  readonly query: ComponentType[] = [];

  private _pending: ProcessLootRequest[] = [];
  progressionSystem?: ProgressionSystem;

  constructor(progressionSystem?: ProgressionSystem) {
    super();
    this.progressionSystem = progressionSystem;
  }

  /** 사망 엔티티의 전리품 처리 요청 */
  processLoot(deadEntityId: number, receiverId?: number): void {
    this._pending.push({ deadEntityId, receiverId });
  }

  onInit(): void {
    // stats:died 발생 시 자동 감지할 수 있도록 버스 리스너 등록 가능
  }

  update(entities: Entity[], _delta: number): void {
    if (this._pending.length === 0) return;

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    for (const req of this._pending) {
      const dead = entityMap.get(req.deadEntityId);
      if (!dead) continue;

      const lootComp = dead.get(LootComponent);
      if (!lootComp) continue;

      const rolledItems = lootComp.rollDrops();
      const expGained = lootComp.exp;

      const receiver = req.receiverId !== undefined ? entityMap.get(req.receiverId) : undefined;

      // 1. 아이템 지급 (수령자 인벤토리가 있는 경우)
      if (receiver) {
        const inv = receiver.get(InventoryComponent);
        if (inv) {
          for (const item of rolledItems) {
            inv.add(item.itemId, item.quantity);
          }
        }
      }

      // 2. 경험치 지급
      if (receiver && expGained > 0 && this.progressionSystem) {
        this.progressionSystem.applyExpDirect(receiver, expGained);
      }

      // 3. 전리품 발생 이벤트 발행
      this.bus.emit('loot:dropped', {
        deadEntityId: req.deadEntityId,
        receiverId: req.receiverId,
        items: rolledItems,
        exp: expGained,
      });
    }

    this._pending = [];
  }
}
