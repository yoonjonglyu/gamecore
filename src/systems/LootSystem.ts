/**
 * @module systems/LootSystem
 * 엔티티 사망 시 전리품(드랍 아이템 및 처치 경험치)을 산출하고 수령자에게 지급하는 시스템.
 * SeededRandom을 주입받아 결정론적 전리품 드랍을 지원한다.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { LootComponent } from '../components/LootComponent';
import { InventoryComponent } from '../components/InventoryComponent';
import { ProgressionSystem } from './ProgressionSystem';
import { SeededRandom } from '../math/SeededRandom';

export interface ProcessLootRequest {
  deadEntityId: number;
  receiverId?: number;
}

export class LootSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [];

  private _pending: ProcessLootRequest[] = [];
  progressionSystem?: ProgressionSystem;
  private _random?: SeededRandom;

  constructor(progressionSystem?: ProgressionSystem, random?: SeededRandom) {
    super();
    this.progressionSystem = progressionSystem;
    this._random = random;
  }

  setRandom(random: SeededRandom): this {
    this._random = random;
    return this;
  }

  get random(): SeededRandom | undefined {
    return this._random;
  }

  /** 사망 엔티티의 전리품 처리 요청 */
  processLoot(deadEntityId: number, receiverId?: number): void {
    this._pending.push({ deadEntityId, receiverId });
  }

  onInit(): void {
    // stats:died 발생 시 killerId가 있으면 자동으로 전리품 처리 큐에 등록
    this.bus.on('stats:died', ({ entityId, killerId }) => {
      this.processLoot(entityId, killerId);
    });
  }

  update(entities: Entity[], _delta: number): void {
    if (this._pending.length === 0) return;

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    for (const req of this._pending) {
      const dead = entityMap.get(req.deadEntityId);
      if (!dead) continue;

      const lootComp = dead.get(LootComponent);
      if (!lootComp) continue;

      const rolledItems = lootComp.rollDrops(this._random);
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
