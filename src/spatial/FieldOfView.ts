/**
 * @module spatial/FieldOfView
 * 2D 타일 기반 그리드 맵(GridMap)을 위한 시야(Field of View, Fog of War) 및 가시선(Line of Sight) 판정 모듈.
 * 0-Dependency 순수 TS.
 *
 * 지원 기능:
 * 1) Bresenham 알고리즘 기반 가시선(LOS) 판정: 두 좌표 사이가 벽에 가로막히지 않고 보이는지 판정
 * 2) 원형 반경 Raycasting 기반 시야(FOV) 계산: 유닛 중심 가시 타일 목록 산출
 */

import { GridMap } from './GridMap';
import { GridCoord } from './GridPathfinding';

export interface FOVOptions {
  /** 동적으로 시야를 가리는 장애물 좌표 집합 (선택) */
  extraBlocking?: Set<string> | GridCoord[];
  /** 시야가 닿은 벽 타일 자체도 보이게 할지 여부 (기본: true) */
  includeWalls?: boolean;
}

function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export class LineOfSight {
  /**
   * 시작점(x0, y0)과 목표점(x1, y1) 사이에 시야를 차단하는 장애물이 없는지 검사합니다 (Bresenham 알고리즘).
   *
   * @param map GridMap 인스턴스
   * @param x0 시작점 X
   * @param y0 시작점 Y
   * @param x1 목표점 X
   * @param y1 목표점 Y
   * @param extraBlocking 동적 차단 좌표 집합
   */
  static hasLineOfSight(
    map: GridMap,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    extraBlocking?: Set<string> | GridCoord[],
  ): boolean {
    const blockingSet = new Set<string>();
    if (extraBlocking) {
      if (extraBlocking instanceof Set) {
        for (const k of extraBlocking) blockingSet.add(k);
      } else {
        for (const pt of extraBlocking) blockingSet.add(coordKey(pt.x, pt.y));
      }
    }

    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1;
    let sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let cx = x0;
    let cy = y0;

    while (true) {
      // 목표점에 도달했으면 시야 확보 성공
      if (cx === x1 && cy === y1) {
        return true;
      }

      // 시작점이 아닌 중간 타일 검사: 벽이거나 동적 차단물이면 시야 차단
      if (cx !== x0 || cy !== y0) {
        if (!map.isWalkable(cx, cy) || blockingSet.has(coordKey(cx, cy))) {
          return false;
        }
      }

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }
}

export class FieldOfView {
  /**
   * 지정된 좌표 중심 반경(radius) 내에서 보이는 모든 타일 좌표를 계산하여 반환합니다.
   */
  static compute(
    map: GridMap,
    originX: number,
    originY: number,
    radius: number,
    options: FOVOptions = {},
  ): GridCoord[] {
    const { extraBlocking, includeWalls = true } = options;

    const visibleSet = new Set<string>();
    const result: GridCoord[] = [];

    // 시작점은 항상 보임
    visibleSet.add(coordKey(originX, originY));
    result.push({ x: originX, y: originY });

    const r2 = radius * radius;

    // 바운딩 박스 내 타일들 중 반경 내 타일에 대해 LOS 검사
    const minX = Math.max(0, originX - radius);
    const maxX = Math.min(map.width - 1, originX + radius);
    const minY = Math.max(0, originY - radius);
    const maxY = Math.min(map.height - 1, originY + radius);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x === originX && y === originY) continue;

        const distSq = (x - originX) * (x - originX) + (y - originY) * (y - originY);
        if (distSq > r2) continue;

        const isWall = !map.isWalkable(x, y);
        if (isWall && !includeWalls) continue;

        if (LineOfSight.hasLineOfSight(map, originX, originY, x, y, extraBlocking)) {
          const key = coordKey(x, y);
          if (!visibleSet.has(key)) {
            visibleSet.add(key);
            result.push({ x, y });
          }
        }
      }
    }

    return result;
  }
}
