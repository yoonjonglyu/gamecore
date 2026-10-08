/**
 * @module systems/InventorySystem
 * 인벤토리 관련 로직 — 아이템 추가/제거, 이벤트 발행.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { InventoryComponent } from '../components/InventoryComponent';
import { CoreEvents } from '../events';

export interface InventoryRequest {
  type: 'add' | 'remove';
  entityId: number;
  defId: number;
  quantity: number;
}

export class InventorySystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [InventoryComponent];

  private _pending: InventoryRequest[] = [];

  request(req: InventoryRequest): void {
    this._pending.push(req);
  }

  update(entities: Entity[], _delta: number): void {
    if (this._pending.length === 0) return;

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    for (const req of this._pending) {
      const entity = entityMap.get(req.entityId);
      if (!entity) continue;
      const inv = entity.get(InventoryComponent)!;

      if (req.type === 'add') {
        const wasFull = inv.isFull;
        const ok = inv.add(req.defId, req.quantity);
        if (ok) {
          this.bus.emit('inventory:item:added', {
            entityId: req.entityId,
            defId: req.defId,
            quantity: req.quantity,
          });
        }
        if (!wasFull && inv.isFull) {
          this.bus.emit('inventory:full', { entityId: req.entityId });
        }
      } else {
        const ok = inv.remove(req.defId, req.quantity);
        if (ok) {
          this.bus.emit('inventory:item:removed', {
            entityId: req.entityId,
            defId: req.defId,
            quantity: req.quantity,
          });
        }
      }
    }
    this._pending = [];
  }
}
