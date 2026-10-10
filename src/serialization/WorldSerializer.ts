/**
 * @module serialization/WorldSerializer
 * World의 모든 Entity와 Component 상태를 JSON으로 직렬화하고 복원하는 시리얼라이저.
 * 로컬 저장소(localStorage), 파일 세이브/로드, 네트워크 전송 등에 사용된다.
 */

import { World } from '../core/World';
import { Entity } from '../core/Entity';
import { ComponentRegistry, defaultComponentRegistry } from './ComponentRegistry';

export interface SerializedComponent {
  type: string;
  data: Record<string, unknown>;
}

export interface SerializedEntity {
  id: number;
  tags: string[];
  components: SerializedComponent[];
}

export interface SerializedWorld {
  version: string;
  timestamp: number;
  entities: SerializedEntity[];
  blackboard?: Record<string, any>;
}

export interface SerializeOptions {
  /** 특정 엔티티만 저장하고 싶을 때 (예: player만 세이브) */
  filterEntity?: (entity: Entity) => boolean;
}

export interface DeserializeOptions {
  /** 복원 전 기존 월드의 엔티티들을 모두 제거할지 여부 (기본: false) */
  clearWorld?: boolean;
}

export class WorldSerializer {
  readonly registry: ComponentRegistry;

  constructor(registry: ComponentRegistry = defaultComponentRegistry) {
    this.registry = registry;
  }

  /**
   * World의 상태를 직렬화 가능한 객체로 변환한다.
   */
  serialize(world: World<any>, options?: SerializeOptions): SerializedWorld {
    const entities = world.entities;
    const serializedEntities: SerializedEntity[] = [];

    for (const entity of entities) {
      if (options?.filterEntity && !options.filterEntity(entity)) {
        continue;
      }

      const components: SerializedComponent[] = [];
      for (const comp of entity.allComponents) {
        const serialized = this.registry.serializeComponent(comp);
        if (serialized) {
          components.push(serialized);
        }
      }

      serializedEntities.push({
        id: entity.id,
        tags: Array.from(entity.tags),
        components,
      });
    }

    return {
      version: '1.0',
      timestamp: Date.now(),
      entities: serializedEntities,
      blackboard: world.blackboard ? world.blackboard.toJSON() : undefined,
    };
  }

  /**
   * World의 상태를 JSON 문자열로 직렬화한다.
   */
  toJSON(world: World<any>, options?: SerializeOptions): string {
    return JSON.stringify(this.serialize(world, options));
  }

  /**
   * 직렬화된 데이터(객체 또는 JSON 문자열)를 World에 복원한다.
   * 복원된 엔티티 목록을 반환한다.
   */
  deserialize(
    data: SerializedWorld | string,
    targetWorld: World<any>,
    options?: DeserializeOptions,
  ): Entity[] {
    const parsed: SerializedWorld = typeof data === 'string' ? JSON.parse(data) : data;

    if (options?.clearWorld) {
      // 기존 엔티티 모두 제거
      for (const e of [...targetWorld.entities]) {
        targetWorld.removeEntity(e.id);
      }
    }

    if (parsed.blackboard && targetWorld.blackboard) {
      targetWorld.blackboard.fromJSON(parsed.blackboard);
    }

    const createdEntities: Entity[] = [];

    for (const serializedEntity of parsed.entities) {
      const entity = targetWorld.createEntity(...serializedEntity.tags);

      for (const compData of serializedEntity.components) {
        const comp = this.registry.deserializeComponent(compData.type, compData.data);
        if (comp) {
          entity.add(comp);
        }
      }

      createdEntities.push(entity);
    }

    return createdEntities;
  }
}

export const defaultWorldSerializer = new WorldSerializer();
