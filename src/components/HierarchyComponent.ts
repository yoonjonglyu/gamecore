/**
 * @module components/HierarchyComponent
 * 엔티티 간의 부모-자식(Parent-Child) 계층 관계를 정의하는 컴포넌트.
 *
 * 지원 기능:
 * - 소환수/펫, 탈것(Mount), 멀티파트 보스(본체-날개-팔) 구조 표현
 * - 상대 위치 오프셋(offsetX, offsetY) 지원
 * - 부모 엔티티 파괴 시 자식 자동 파괴 여부(cascadeDestroy) 제어
 */

import { Component } from '../core/Component';

export interface HierarchyProps {
  /** 부모 엔티티 ID (최상위 루트인 경우 undefined) */
  parentId?: number;
  /** 부모 기준 상대 X 오프셋 (기본: 0) */
  offsetX?: number;
  /** 부모 기준 상대 Y 오프셋 (기본: 0) */
  offsetY?: number;
  /** 부모 엔티티가 파괴될 때 자식 엔티티도 함께 파괴할지 여부 (기본: true) */
  cascadeDestroy?: boolean;
}

export class HierarchyComponent extends Component {
  parentId?: number;
  offsetX: number;
  offsetY: number;
  cascadeDestroy: boolean;
  /** 현재 엔티티를 부모로 두고 있는 자식 엔티티 ID 목록 */
  readonly childIds: Set<number> = new Set();

  constructor(props: HierarchyProps = {}) {
    super();
    this.parentId = props.parentId;
    this.offsetX = props.offsetX ?? 0;
    this.offsetY = props.offsetY ?? 0;
    this.cascadeDestroy = props.cascadeDestroy ?? true;
  }

  addChild(childEntityId: number): void {
    this.childIds.add(childEntityId);
  }

  removeChild(childEntityId: number): void {
    this.childIds.delete(childEntityId);
  }

  hasChild(childEntityId: number): boolean {
    return this.childIds.has(childEntityId);
  }
}
