/**
 * @module systems/HierarchySystem
 * 부모-자식 엔티티 계층 구조(HierarchyComponent)를 관리하는 시스템.
 *
 * 1) 위치 동기화: 부모 엔티티의 PositionComponent를 추종하여 자식 위치를 (parent.x + offsetX, parent.y + offsetY)로 갱신
 * 2) 종속 파괴: 부모 엔티티가 파괴되거나 없어진 경우 cascadeDestroy 옵션에 따라 자식 엔티티도 자동 파괴
 */

import { System } from '../core/System';
import { Entity } from '../core/Entity';
import { HierarchyComponent } from '../components/HierarchyComponent';
import { PositionComponent } from '../spatial/PositionComponent';

export class HierarchySystem extends System {
  public readonly query = [HierarchyComponent];

  constructor(priority: number = 18) {
    super();
    this.priority = priority; // MovementSystem(20) 직후, SpatialGridSystem(15) 직전 실행
  }

  update(entities: Entity[]): void {
    if (!this.bus) return;

    const synced = new Set<number>();

    const syncEntity = (entity: Entity, chain: Set<number>): void => {
      if (synced.has(entity.id)) return;
      const hierarchy = entity.get(HierarchyComponent);
      if (!hierarchy) {
        synced.add(entity.id);
        return;
      }

      // 등록된 childIds 중 더 이상 유효하지 않은 자식 정리
      for (const cid of [...hierarchy.childIds]) {
        const child = entity.world?.getEntity(cid);
        const childH = child?.get(HierarchyComponent);
        if (!child || !childH || childH.parentId !== entity.id) {
          hierarchy.removeChild(cid);
        }
      }

      if (hierarchy.parentId === undefined) {
        synced.add(entity.id);
        return;
      }

      // 자기 참조 / 순환 참조 가드
      if (hierarchy.parentId === entity.id || chain.has(hierarchy.parentId)) {
        hierarchy.parentId = undefined;
        synced.add(entity.id);
        return;
      }

      const parent = entity.world?.getEntity(hierarchy.parentId);
      if (!parent) {
        // 부모가 소멸된 경우
        if (hierarchy.cascadeDestroy && entity.world) {
          entity.world.destroyEntity(entity);
        } else {
          hierarchy.parentId = undefined;
        }
        synced.add(entity.id);
        return;
      }

      // 부모 먼저 동기화 (다단계 계층에서의 1틱 지연 방지)
      chain.add(entity.id);
      syncEntity(parent, chain);
      chain.delete(entity.id);

      // 부모의 자식 목록에 등록 보장
      const parentHierarchy = parent.get(HierarchyComponent);
      if (parentHierarchy && !parentHierarchy.hasChild(entity.id)) {
        parentHierarchy.addChild(entity.id);
      }

      // 부모의 위치가 존재하고, 자식도 PositionComponent를 가지고 있다면 상대 좌표 동기화
      const parentPos = parent.get(PositionComponent);
      const childPos = entity.get(PositionComponent);

      if (parentPos && childPos) {
        childPos.x = parentPos.x + hierarchy.offsetX;
        childPos.y = parentPos.y + hierarchy.offsetY;
      }

      synced.add(entity.id);
    };

    for (const entity of entities) {
      syncEntity(entity, new Set());
    }
  }
}
