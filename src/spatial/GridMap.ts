/**
 * @module spatial/GridMap
 * 2D 타일 기반 그리드 맵 클래스.
 * 타일 통행 가능 여부(walkable) 검사와 좌표 유효성을 관리한다.
 */

import { GridPathfinder, PathfindingOptions, PathResult, GridCoord } from './GridPathfinding';
import { LineOfSight, FieldOfView } from './FieldOfView';

export interface Tile {
  type: string;
  walkable: boolean;
  cost?: number;
}

export class GridMap {
  readonly width: number;
  readonly height: number;
  readonly id: string;
  private _tiles: Tile[][];

  constructor(width: number, height: number, id: string = 'default') {
    this.width = width;
    this.height = height;
    this.id = id;
    this._tiles = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ type: 'floor', walkable: true })),
    );
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  getTile(x: number, y: number): Tile | undefined {
    if (!this.inBounds(x, y)) return undefined;
    return this._tiles[y][x];
  }

  setTile(x: number, y: number, tile: Tile): boolean {
    if (!this.inBounds(x, y)) return false;
    this._tiles[y][x] = tile;
    return true;
  }

  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile ? tile.walkable : false;
  }

  /**
   * 문자열 아스키 아트로부터 그리드 맵을 간편하게 빌드하는 팩토리 메서드.
   *
   * @example
   * const map = GridMap.fromASCII([
   *   '###',
   *   '#.#',
   *   '###'
   * ], {
   *   '#': { type: 'wall', walkable: false },
   *   '.': { type: 'floor', walkable: true }
   * });
   */
  static fromASCII(
    lines: string[],
    legend: Record<string, Tile>,
    id: string = 'default',
  ): GridMap {
    const height = lines.length;
    const width = Math.max(...lines.map((l) => l.length));
    const map = new GridMap(width, height, id);

    for (let y = 0; y < height; y++) {
      const line = lines[y];
      for (let x = 0; x < width; x++) {
        const char = line[x] ?? ' ';
        const tile = legend[char] ?? { type: 'floor', walkable: true };
        map.setTile(x, y, { ...tile });
      }
    }

    return map;
  }

  /**
   * 시작점부터 목표점까지의 최단 경로를 A* 알고리즘으로 탐색합니다.
   */
  findPath(
    start: GridCoord,
    goal: GridCoord,
    options?: PathfindingOptions,
  ): PathResult {
    return GridPathfinder.findPath(this, start, goal, options);
  }

  /**
   * 두 좌표 사이에 시야를 차단하는 장애물이 없는지 검사합니다 (Bresenham 알고리즘).
   */
  hasLineOfSight(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    extraBlocking?: Set<string> | GridCoord[],
  ): boolean {
    return LineOfSight.hasLineOfSight(this, x0, y0, x1, y1, extraBlocking);
  }

  /**
   * 중심 좌표로부터 반경(radius) 내에 보이는 가시 타일 목록을 계산합니다.
   */
  computeFOV(
    originX: number,
    originY: number,
    radius: number,
    options?: import('./FieldOfView').FOVOptions,
  ): GridCoord[] {
    return FieldOfView.compute(this, originX, originY, radius, options);
  }
}
