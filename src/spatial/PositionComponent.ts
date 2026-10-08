/**
 * @module spatial/PositionComponent
 * 2D 공간/그리드 상의 엔티티 좌표 및 장애물 속성을 관리하는 컴포넌트.
 */

import { Component } from '../core/Component';

export interface PositionProps {
  x?: number;
  y?: number;
  mapId?: string;
  /** 다른 엔티티의 통행을 막는 블록 여부 (벽, 다른 유닛 등) */
  isBlocked?: boolean;
}

export class PositionComponent extends Component {
  x: number;
  y: number;
  mapId?: string;
  isBlocked: boolean;

  constructor(props: PositionProps = {}) {
    super();
    this.x = props.x ?? 0;
    this.y = props.y ?? 0;
    this.mapId = props.mapId;
    this.isBlocked = props.isBlocked ?? true;
  }

  set(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  distanceTo(other: { x: number; y: number }): number {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  manhattanDistanceTo(other: { x: number; y: number }): number {
    return Math.abs(this.x - other.x) + Math.abs(this.y - other.y);
  }
}
