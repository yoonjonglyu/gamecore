/**
 * @module spatial/MovementSystem
 * 엔티티의 그리드 이동 및 장애물/지형 충돌 판정을 처리하는 시스템.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { PositionComponent } from './PositionComponent';
import { GridMap } from './GridMap';

export interface MoveRequest {
  entityId: number;
  targetX: number;
  targetY: number;
}

export class MovementSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [PositionComponent];

  private _pending: MoveRequest[] = [];
  map?: GridMap;

  constructor(map?: GridMap) {
    super();
    this.map = map;
  }

  setMap(map: GridMap): void {
    this.map = map;
  }

  requestMove(entityId: number, targetX: number, targetY: number): void {
    this._pending.push({ entityId, targetX, targetY });
  }

  requestMoveBy(entityId: number, dx: number, dy: number, entities: Entity[]): void {
    const entity = entities.find((e) => e.id === entityId);
    if (!entity) return;
    const pos = entity.get(PositionComponent);
    if (!pos) return;
    this.requestMove(entityId, pos.x + dx, pos.y + dy);
  }

  update(entities: Entity[], _delta: number): void {
    if (this._pending.length === 0) return;

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    for (const req of this._pending) {
      const entity = entityMap.get(req.entityId);
      if (!entity) continue;

      const pos = entity.get(PositionComponent);
      if (!pos) continue;

      const fromX = pos.x;
      const fromY = pos.y;
      const { targetX, targetY } = req;

      // 1. 맵 지형 충돌 검사
      if (this.map) {
        if (!this.map.inBounds(targetX, targetY)) {
          this.bus.emit('movement:blocked', {
            entityId: entity.id,
            fromX,
            fromY,
            targetX,
            targetY,
            reason: 'out_of_bounds',
          });
          continue;
        }

        if (!this.map.isWalkable(targetX, targetY)) {
          this.bus.emit('movement:blocked', {
            entityId: entity.id,
            fromX,
            fromY,
            targetX,
            targetY,
            reason: 'tile_blocked',
          });
          continue;
        }
      }

      // 2. 다른 엔티티 장애물 충돌 검사
      const isBlockedByEntity = entities.some((other) => {
        if (other.id === entity.id) return false;
        const otherPos = other.get(PositionComponent);
        return otherPos && otherPos.isBlocked && otherPos.x === targetX && otherPos.y === targetY;
      });

      if (isBlockedByEntity) {
        this.bus.emit('movement:blocked', {
          entityId: entity.id,
          fromX,
          fromY,
          targetX,
          targetY,
          reason: 'entity_blocked',
        });
        continue;
      }

      // 3. 이동 성공
      pos.set(targetX, targetY);

      this.bus.emit('movement:moved', {
        entityId: entity.id,
        fromX,
        fromY,
        toX: targetX,
        toY: targetY,
      });
    }

    this._pending = [];
  }
}
