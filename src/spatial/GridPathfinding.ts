/**
 * @module spatial/GridPathfinding
 * 2D 타일 기반 그리드 맵(GridMap)을 위한 결정론적 A* (A-Star) 경로 탐색 알고리즘.
 * 4방향/8방향 대각선 이동, 지형별 가중치(cost), 최대 스텝 제한 및 동적 장애물(extraObstacles)을 지원한다.
 */

import { GridMap, Tile } from './GridMap';

export interface GridCoord {
  x: number;
  y: number;
}

export type HeuristicType = 'manhattan' | 'euclidean' | 'chebyshev';

export interface PathfindingOptions {
  /** 대각선 이동 허용 여부 (기본: false) */
  allowDiagonal?: boolean;
  /** 휴리스틱 알고리즘 (기본: 'manhattan' - 대각선 허용 시 'chebyshev' 권장) */
  heuristic?: HeuristicType;
  /** 최대 탐색 스텝/노드 상한선 (기본: 2000, 무한 루프 및 프레임 드랍 방지) */
  maxSteps?: number;
  /** 동적으로 추가할 장애물 좌표 집합 (예: 다른 유닛 위치) */
  extraObstacles?: Array<GridCoord> | Set<string>;
  /** 타일별 이동 비용 커스텀 가중치 계산 콜백 */
  costMultiplier?: (tile: Tile, coord: GridCoord) => number;
}

export interface PathResult {
  /** 경로 탐색 성공 여부 */
  found: boolean;
  /** 시작점부터 목표점까지의 연속 좌표 목록 (시작점 포함) */
  path: GridCoord[];
  /** 총 이동 비용 (g-cost) */
  cost: number;
  /** 탐색 과정에서 방문한 노드 수 */
  visitedCount: number;
}

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent?: Node;
}

function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export class GridPathfinder {
  /**
   * 휴리스틱 거리 계산
   */
  static calculateHeuristic(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    type: HeuristicType = 'manhattan',
  ): number {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);

    switch (type) {
      case 'manhattan':
        return dx + dy;
      case 'euclidean':
        return Math.sqrt(dx * dx + dy * dy);
      case 'chebyshev':
        return Math.max(dx, dy);
      default:
        return dx + dy;
    }
  }

  /**
   * GridMap 상에서 start부터 goal까지의 최단 경로를 A* 알고리즘으로 탐색합니다.
   */
  static findPath(
    map: GridMap,
    start: GridCoord,
    goal: GridCoord,
    options: PathfindingOptions = {},
  ): PathResult {
    const {
      allowDiagonal = false,
      heuristic = allowDiagonal ? 'chebyshev' : 'manhattan',
      maxSteps = 2000,
      extraObstacles,
      costMultiplier,
    } = options;

    // 시작점이나 목표점이 맵 밖이면 즉시 실패
    if (!map.inBounds(start.x, start.y) || !map.inBounds(goal.x, goal.y)) {
      return { found: false, path: [], cost: 0, visitedCount: 0 };
    }

    // 목표점이 통행 불가능 타일이면 즉시 실패
    if (!map.isWalkable(goal.x, goal.y)) {
      return { found: false, path: [], cost: 0, visitedCount: 0 };
    }

    // 동적 장애물 셋 구성
    const obstacleSet = new Set<string>();
    if (extraObstacles) {
      if (extraObstacles instanceof Set) {
        for (const key of extraObstacles) obstacleSet.add(key);
      } else {
        for (const obs of extraObstacles) obstacleSet.add(coordKey(obs.x, obs.y));
      }
    }

    if (obstacleSet.has(coordKey(goal.x, goal.y))) {
      return { found: false, path: [], cost: 0, visitedCount: 0 };
    }

    // 시작점과 목표점이 같을 때
    if (start.x === goal.x && start.y === goal.y) {
      return { found: true, path: [{ x: start.x, y: start.y }], cost: 0, visitedCount: 1 };
    }

    const openList: Node[] = [];
    const openMap = new Map<string, Node>();
    const closedSet = new Set<string>();

    const startNode: Node = {
      x: start.x,
      y: start.y,
      g: 0,
      h: GridPathfinder.calculateHeuristic(start.x, start.y, goal.x, goal.y, heuristic),
      f: 0,
    };
    startNode.f = startNode.g + startNode.h;

    openList.push(startNode);
    openMap.set(coordKey(start.x, start.y), startNode);

    // 4방향 또는 8방향 이웃 오프셋
    const directions: Array<[number, number, number]> = allowDiagonal
      ? [
          [0, -1, 1],
          [1, 0, 1],
          [0, 1, 1],
          [-1, 0, 1],
          [1, -1, Math.SQRT2],
          [1, 1, Math.SQRT2],
          [-1, 1, Math.SQRT2],
          [-1, -1, Math.SQRT2],
        ]
      : [
          [0, -1, 1],
          [1, 0, 1],
          [0, 1, 1],
          [-1, 0, 1],
        ];

    let visitedCount = 0;

    while (openList.length > 0 && visitedCount < maxSteps) {
      visitedCount++;

      // f 값이 가장 낮은 노드 선택 (단순 정렬 대신 최소값 검색으로 O(N) 최적화)
      let minIdx = 0;
      for (let i = 1; i < openList.length; i++) {
        if (
          openList[i].f < openList[minIdx].f ||
          (openList[i].f === openList[minIdx].f && openList[i].h < openList[minIdx].h)
        ) {
          minIdx = i;
        }
      }

      const current = openList.splice(minIdx, 1)[0];
      const curKey = coordKey(current.x, current.y);
      openMap.delete(curKey);
      closedSet.add(curKey);

      // 목표점 도착!
      if (current.x === goal.x && current.y === goal.y) {
        const path: GridCoord[] = [];
        let curr: Node | undefined = current;
        while (curr) {
          path.unshift({ x: curr.x, y: curr.y });
          curr = curr.parent;
        }
        return {
          found: true,
          path,
          cost: current.g,
          visitedCount,
        };
      }

      // 이웃 탐색
      for (const [dx, dy, moveCost] of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nKey = coordKey(nx, ny);

        if (closedSet.has(nKey)) continue;
        if (!map.inBounds(nx, ny)) continue;
        if (!map.isWalkable(nx, ny)) continue;
        if (obstacleSet.has(nKey)) continue;

        // 대각선 이동 시 코너 깎기(Corner cutting) 방지: 인접한 양쪽 직교 타일이 모두 벽이면 통과 불가
        if (dx !== 0 && dy !== 0) {
          if (!map.isWalkable(current.x + dx, current.y) || !map.isWalkable(current.x, current.y + dy)) {
            continue;
          }
        }

        const tile = map.getTile(nx, ny);
        const tileCost = tile?.cost ?? 1;
        const multiplier = costMultiplier && tile ? costMultiplier(tile, { x: nx, y: ny }) : 1;
        const stepCost = moveCost * tileCost * multiplier;
        const tentativeG = current.g + stepCost;

        let neighbor = openMap.get(nKey);
        if (!neighbor) {
          const h = GridPathfinder.calculateHeuristic(nx, ny, goal.x, goal.y, heuristic);
          neighbor = {
            x: nx,
            y: ny,
            g: tentativeG,
            h,
            f: tentativeG + h,
            parent: current,
          };
          openList.push(neighbor);
          openMap.set(nKey, neighbor);
        } else if (tentativeG < neighbor.g) {
          neighbor.g = tentativeG;
          neighbor.f = tentativeG + neighbor.h;
          neighbor.parent = current;
        }
      }
    }

    // 경로를 찾지 못함
    return {
      found: false,
      path: [],
      cost: 0,
      visitedCount,
    };
  }
}
