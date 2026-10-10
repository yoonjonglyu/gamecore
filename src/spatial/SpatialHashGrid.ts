/**
 * @module spatial/SpatialHashGrid
 * 2D 연속 좌표계(Continuous Coordinate) 상에서 대규모 엔티티의 반경 검색 및 충돌 판정을 O(1)로 수행하는 공간 해시 그리드.
 * 뱀파이어 서바이벌라이크, 액션 RPG, 실시간 슈팅 등 타일 격자가 아닌 연속 평면 게임에 사용된다.
 */

export interface SpatialObject {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export interface SpatialNeighbor {
  entityId: number;
  distance: number;
}

export interface SpatialHashGridOptions {
  cellSize?: number;
}

export class SpatialHashGrid {
  readonly cellSize: number;
  private _cells: Map<string, Set<number>> = new Map();
  private _objects: Map<number, SpatialObject> = new Map();

  constructor(options?: number | SpatialHashGridOptions) {
    const size = typeof options === 'number' ? options : options?.cellSize ?? 100;
    this.cellSize = Math.max(10, size);
  }

  private _hash(cellX: number, cellY: number): string {
    return `${cellX}:${cellY}`;
  }

  /**
   * 엔티티를 공간 해시에 등록하거나 위치를 갱신한다.
   */
  insert(id: number, x: number, y: number, radius: number = 0): void {
    if (this._objects.has(id)) {
      this.remove(id);
    }

    const obj: SpatialObject = { id, x, y, radius };
    this._objects.set(id, obj);

    const minCellX = Math.floor((x - radius) / this.cellSize);
    const maxCellX = Math.floor((x + radius) / this.cellSize);
    const minCellY = Math.floor((y - radius) / this.cellSize);
    const maxCellY = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = this._hash(cx, cy);
        let cell = this._cells.get(key);
        if (!cell) {
          cell = new Set();
          this._cells.set(key, cell);
        }
        cell.add(id);
      }
    }
  }

  /**
   * 엔티티 위치 갱신
   */
  update(id: number, x: number, y: number, radius?: number): void {
    const existing = this._objects.get(id);
    const r = radius ?? existing?.radius ?? 0;
    this.insert(id, x, y, r);
  }

  /**
   * 엔티티 제거
   */
  remove(id: number): boolean {
    const obj = this._objects.get(id);
    if (!obj) return false;

    this._objects.delete(id);

    const minCellX = Math.floor((obj.x - obj.radius) / this.cellSize);
    const maxCellX = Math.floor((obj.x + obj.radius) / this.cellSize);
    const minCellY = Math.floor((obj.y - obj.radius) / this.cellSize);
    const maxCellY = Math.floor((obj.y + obj.radius) / this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = this._hash(cx, cy);
        const cell = this._cells.get(key);
        if (cell) {
          cell.delete(id);
          if (cell.size === 0) {
            this._cells.delete(key);
          }
        }
      }
    }

    return true;
  }

  /**
   * 원형 반경(Circle) 내에 존재하는 엔티티 ID 목록을 조회한다.
   */
  queryCircle(x: number, y: number, radius: number): number[] {
    const minCellX = Math.floor((x - radius) / this.cellSize);
    const maxCellX = Math.floor((x + radius) / this.cellSize);
    const minCellY = Math.floor((y - radius) / this.cellSize);
    const maxCellY = Math.floor((y + radius) / this.cellSize);

    const candidates = new Set<number>();

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cell = this._cells.get(this._hash(cx, cy));
        if (cell) {
          for (const id of cell) {
            candidates.add(id);
          }
        }
      }
    }

    const results: number[] = [];

    for (const id of candidates) {
      const obj = this._objects.get(id);
      if (!obj) continue;
      const dx = obj.x - x;
      const dy = obj.y - y;
      const totalR = radius + obj.radius;
      if (dx * dx + dy * dy <= totalR * totalR) {
        results.push(id);
      }
    }

    return results;
  }

  /**
   * 원형 반경 내의 엔티티들을 거리와 함께 거리 오름차순으로 정렬하여 조회한다.
   */
  queryRadius(x: number, y: number, radius: number): SpatialNeighbor[] {
    const ids = this.queryCircle(x, y, radius);
    const neighbors: SpatialNeighbor[] = [];

    for (const id of ids) {
      const obj = this._objects.get(id);
      if (!obj) continue;
      const dx = obj.x - x;
      const dy = obj.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      neighbors.push({ entityId: id, distance });
    }

    return neighbors.sort((a, b) => a.distance - b.distance);
  }

  /**
   * 사각형 범위(AABB Box) 내에 존재하는 엔티티 ID 목록을 조회한다.
   */
  queryBox(minX: number, minY: number, maxX: number, maxY: number): number[] {
    const minCellX = Math.floor(minX / this.cellSize);
    const maxCellX = Math.floor(maxX / this.cellSize);
    const minCellY = Math.floor(minY / this.cellSize);
    const maxCellY = Math.floor(maxY / this.cellSize);

    const candidates = new Set<number>();

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cell = this._cells.get(this._hash(cx, cy));
        if (cell) {
          for (const id of cell) {
            candidates.add(id);
          }
        }
      }
    }

    const results: number[] = [];
    for (const id of candidates) {
      const obj = this._objects.get(id);
      if (!obj) continue;
      if (obj.x >= minX && obj.x <= maxX && obj.y >= minY && obj.y <= maxY) {
        results.push(id);
      }
    }

    return results;
  }

  /**
   * 사각형 범위(AABB Box) 조회의 편의 별칭
   */
  queryAABB(minX: number, minY: number, maxX: number, maxY: number): number[] {
    return this.queryBox(minX, minY, maxX, maxY);
  }

  /**
   * 기준점에서 가장 가까운 엔티티를 찾는다.
   */
  findNearest(x: number, y: number, maxRadius: number = Infinity): SpatialNeighbor | undefined {
    const searchRadius = Number.isFinite(maxRadius) ? maxRadius : this.cellSize * 5;
    const candidates = this.queryCircle(x, y, searchRadius);

    let closestId: number | undefined;
    let closestDistSq = Infinity;

    for (const id of candidates) {
      const obj = this._objects.get(id);
      if (!obj) continue;
      const dx = obj.x - x;
      const dy = obj.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        closestId = id;
      }
    }

    if (closestId !== undefined) {
      return { entityId: closestId, distance: Math.sqrt(closestDistSq) };
    }

    return undefined;
  }

  clear(): void {
    this._cells.clear();
    this._objects.clear();
  }

  get size(): number {
    return this._objects.size;
  }
}
