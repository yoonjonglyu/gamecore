/**
 * @module spatial/SpatialGridSystem
 * PositionComponent를 보유한 엔티티의 연속 2D 좌표를 SpatialHashGrid에 자동으로 동기화하는 시스템.
 * 수동으로 grid.update/remove를 호출할 필요 없이, 시스템 틱마다 위치 변경을 감지하여 공간 해시를 최신 상태로 유지한다.
 */

import { System } from '../core/System';
import { Entity } from '../core/Entity';
import { PositionComponent } from './PositionComponent';
import { SpatialHashGrid, SpatialNeighbor, SpatialHashGridOptions } from './SpatialHashGrid';

export interface SpatialGridSystemOptions {
  grid?: SpatialHashGrid;
  gridOptions?: SpatialHashGridOptions;
  priority?: number;
}

export class SpatialGridSystem extends System {
  public readonly query = [PositionComponent];
  readonly grid: SpatialHashGrid;
  private _lastPositions: Map<number, { x: number; y: number }> = new Map();

  constructor(options?: SpatialGridSystemOptions) {
    super();
    this.priority = options?.priority ?? 15; // MovementSystem(20) 직후 실행
    this.grid = options?.grid ?? new SpatialHashGrid(options?.gridOptions);
  }

  update(entities: Entity[]): void {
    const currentEntityIds = new Set<number>();

    for (const entity of entities) {
      currentEntityIds.add(entity.id);
      const pos = entity.get(PositionComponent);
      if (!pos) continue;

      const last = this._lastPositions.get(entity.id);
      if (!last || last.x !== pos.x || last.y !== pos.y) {
        this.grid.update(entity.id, pos.x, pos.y);
        this._lastPositions.set(entity.id, { x: pos.x, y: pos.y });
      }
    }

    // 사라진 엔티티는 그리드 및 캐시에서 제거
    for (const id of Array.from(this._lastPositions.keys())) {
      if (!currentEntityIds.has(id)) {
        this.grid.remove(id);
        this._lastPositions.delete(id);
      }
    }
  }

  /**
   * 특정 엔티티의 위치를 그리드에 즉시 동기화합니다.
   */
  syncEntity(entity: Entity): void {
    const pos = entity.get(PositionComponent);
    if (!pos) {
      this.grid.remove(entity.id);
      this._lastPositions.delete(entity.id);
      return;
    }

    this.grid.update(entity.id, pos.x, pos.y);
    this._lastPositions.set(entity.id, { x: pos.x, y: pos.y });
  }

  /**
   * 지정된 좌표 중심의 반경 내 엔티티들을 거리순으로 조회합니다 (grid.queryRadius 래핑).
   */
  queryRadius(x: number, y: number, radius: number): SpatialNeighbor[] {
    return this.grid.queryRadius(x, y, radius);
  }

  /**
   * 지정된 사각 영역 내 엔티티 ID 목록을 조회합니다 (grid.queryAABB 래핑).
   */
  queryAABB(minX: number, minY: number, maxX: number, maxY: number): number[] {
    return this.grid.queryAABB(minX, minY, maxX, maxY);
  }

  onDestroy(): void {
    this.grid.clear();
    this._lastPositions.clear();
  }
}
