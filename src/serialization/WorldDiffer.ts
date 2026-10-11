/**
 * @module serialization/WorldDiffer
 * 멀티플레이어, WebSocket 게임 서버 및 클라이언트 간의 네트워크 대역폭을 최적화하기 위한
 * 월드 증분 패치(Delta Patch) 생성기 및 적용기.
 *
 * 매 틱 전체 월드(수 KB)를 보내는 대신, 직전 스냅샷 대비 변경된 내용(수 바이트~수십 바이트)만
 * 컴팩트하게 추출하고 클라이언트에 즉시 반영한다.
 */

import { World } from '../core/World';
import { Entity } from '../core/Entity';
import { WorldSerializer, SerializedEntity, SerializedComponent, defaultWorldSerializer } from './WorldSerializer';

export interface ComponentPatch {
  entityId: number;
  component: SerializedComponent;
}

export interface ComponentRemovalPatch {
  entityId: number;
  componentType: string;
}

export interface WorldDelta {
  /** 델타 생성 시점 타임스탬프 또는 틱 번호 */
  timestamp: number;
  /** 새로 스폰된 엔티티 목록 */
  created: SerializedEntity[];
  /** 파괴/삭제된 엔티티 ID 목록 */
  destroyed: number[];
  /** 추가되거나 수정된 컴포넌트 목록 */
  updatedComponents: ComponentPatch[];
  /** 엔티티에서 제거된 컴포넌트 목록 */
  removedComponents: ComponentRemovalPatch[];
  /** 변경된 전역 블랙보드 키-값 쌍 (선택) */
  blackboard?: Record<string, any>;
}

export class WorldDiffer {
  private _serializer: WorldSerializer;
  private _lastEntityMap: Map<number, SerializedEntity> = new Map();
  private _lastBlackboard: Record<string, any> = {};

  constructor(serializer: WorldSerializer = defaultWorldSerializer) {
    this._serializer = serializer;
  }

  /**
   * 기준 스냅샷을 캡처합니다. 이후 createDelta() 호출 시 이 시점과의 차이를 산출합니다.
   */
  captureSnapshot(world: World<any>): void {
    const serialized = this._serializer.serialize(world);
    this._lastEntityMap.clear();
    for (const ent of serialized.entities) {
      this._lastEntityMap.set(ent.id, ent);
    }
    this._lastBlackboard = { ...serialized.blackboard };
  }

  /**
   * 직전 스냅샷 대비 현재 월드의 차이점(Delta)을 추출합니다.
   * 추출 후 내부 스냅샷을 현재 상태로 자동 갱신합니다.
   */
  createDelta(world: World<any>): WorldDelta {
    const currentSerialized = this._serializer.serialize(world);
    const currentEntityMap = new Map<number, SerializedEntity>();
    for (const ent of currentSerialized.entities) {
      currentEntityMap.set(ent.id, ent);
    }

    const created: SerializedEntity[] = [];
    const destroyed: number[] = [];
    const updatedComponents: ComponentPatch[] = [];
    const removedComponents: ComponentRemovalPatch[] = [];

    // 1. 신규 엔티티 및 수정된 컴포넌트 감지
    for (const [id, curEnt] of currentEntityMap) {
      const prevEnt = this._lastEntityMap.get(id);

      if (!prevEnt) {
        // 새로 생성된 엔티티
        created.push(curEnt);
      } else {
        // 기존 엔티티의 컴포넌트 변화 비교
        const prevCompMap = new Map<string, string>();
        for (const c of prevEnt.components) {
          prevCompMap.set(c.type, JSON.stringify(c.data));
        }

        const curCompTypes = new Set<string>();
        for (const c of curEnt.components) {
          curCompTypes.add(c.type);
          const curJson = JSON.stringify(c.data);
          const prevJson = prevCompMap.get(c.type);

          if (prevJson === undefined || prevJson !== curJson) {
            // 새로 추가되었거나 데이터가 수정된 컴포넌트
            updatedComponents.push({
              entityId: id,
              component: c,
            });
          }
        }

        // 제거된 컴포넌트 검사
        for (const prevC of prevEnt.components) {
          if (!curCompTypes.has(prevC.type)) {
            removedComponents.push({
              entityId: id,
              componentType: prevC.type,
            });
          }
        }
      }
    }

    // 2. 파괴된 엔티티 감지
    for (const [id] of this._lastEntityMap) {
      if (!currentEntityMap.has(id)) {
        destroyed.push(id);
      }
    }

    // 3. 블랙보드 변화 감지
    const blackboardPatch: Record<string, any> = {};
    let bbChanged = false;
    const currentBB = currentSerialized.blackboard ?? {};
    for (const [k, v] of Object.entries(currentBB)) {
      if (this._lastBlackboard[k] !== v) {
        blackboardPatch[k] = v;
        bbChanged = true;
      }
    }

    // 스냅샷 갱신
    this._lastEntityMap = currentEntityMap;
    this._lastBlackboard = { ...currentBB };

    return {
      timestamp: Date.now(),
      created,
      destroyed,
      updatedComponents,
      removedComponents,
      blackboard: bbChanged ? blackboardPatch : undefined,
    };
  }

  /**
   * 수신한 델타 패치를 대상 월드에 즉시 적용(동기화)합니다.
   * 주로 클라이언트 측에서 서버로부터 받은 패킷을 반영할 때 사용합니다.
   */
  applyDelta(world: World<any>, delta: WorldDelta): void {
    // 1. 파괴된 엔티티 제거
    for (const id of delta.destroyed) {
      const ent = world.getEntity(id);
      if (ent) {
        world.destroyEntity(ent);
      }
    }
    world.flushRemovals();

    // 2. 새로 생성된 엔티티 복원
    if (delta.created.length > 0) {
      this._serializer.deserialize(
        {
          version: '1',
          timestamp: Date.now(),
          entities: delta.created,
          blackboard: {},
        },
        world,
      );
    }

    // 3. 컴포넌트 추가 및 갱신 적용
    for (const patch of delta.updatedComponents) {
      let ent = world.getEntity(patch.entityId);
      if (!ent) {
        ent = world.createEntityWithId(patch.entityId);
      }

      const comp = this._serializer.registry.deserializeComponent(
        patch.component.type,
        patch.component.data,
      );
      if (comp) {
        ent.add(comp);
      }
    }

    // 4. 컴포넌트 제거 적용
    for (const removal of delta.removedComponents) {
      const ent = world.getEntity(removal.entityId);
      if (ent) {
        const compType = this._serializer.registry.getType(removal.componentType);
        if (compType) {
          ent.remove(compType);
        }
      }
    }

    // 5. 블랙보드 갱신 적용
    if (delta.blackboard) {
      for (const [k, v] of Object.entries(delta.blackboard)) {
        world.blackboard.set(k, v);
      }
    }
  }
}
