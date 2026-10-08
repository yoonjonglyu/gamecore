/**
 * @module World
 * ECS의 중심 — Entity 생성/삭제, System 등록, 게임 루프를 관리한다.
 * EventBus를 내장하여 System 간 통신을 중재한다.
 */

import { ComponentType } from './Component';
import { Entity } from './Entity';
import { EventBus, EventMap } from './EventBus';
import { System } from './System';

export class World<Events extends EventMap = EventMap> {
  readonly bus: EventBus<Events>;

  private _entities: Map<number, Entity> = new Map();
  private _systems: System<Events>[] = [];
  /** System이 처리할 entity 캐시 (query → entities) */
  private _queryCache: Map<System<Events>, Entity[]> = new Map();
  /** 다음 틱에 삭제될 entity ID 목록 (지연 삭제) */
  private _pendingRemove: Set<number> = new Set();

  constructor(bus?: EventBus<Events>) {
    this.bus = bus ?? new EventBus<Events>();
  }

  // ──────────────────────────────────────────────
  // Entity 관리
  // ──────────────────────────────────────────────

  createEntity(...tags: string[]): Entity {
    const entity = new Entity(tags);
    this._entities.set(entity.id, entity);
    this._invalidateCache();
    return entity;
  }

  removeEntity(id: number): void {
    this._pendingRemove.add(id);
  }

  getEntity(id: number): Entity | undefined {
    return this._entities.get(id);
  }

  queryEntities(types: ComponentType[]): Entity[] {
    return [...this._entities.values()].filter((e) => e.hasAll(types));
  }

  queryByTag(tag: string): Entity[] {
    return [...this._entities.values()].filter((e) => e.tags.has(tag));
  }

  // ──────────────────────────────────────────────
  // System 관리
  // ──────────────────────────────────────────────

  addSystem(system: System<Events>): this {
    system._init(this.bus);
    this._systems.push(system);
    this._queryCache.set(system, this._buildQuery(system));
    return this;
  }

  removeSystem(system: System<Events>): void {
    system.onDestroy?.();
    this._systems = this._systems.filter((s) => s !== system);
    this._queryCache.delete(system);
  }

  // ──────────────────────────────────────────────
  // 게임 루프
  // ──────────────────────────────────────────────

  /**
   * 한 틱을 실행한다.
   * @param delta 마지막 틱 이후 경과 시간 (ms 또는 s, 게임에서 통일)
   */
  update(delta: number): void {
    // 지연 삭제 처리
    this._flushRemovals();
    // 컴포넌트 추가/제거 후 캐시가 stale해질 수 있으므로 매 틱 재빌드
    // (최적화 필요 시 dirty 플래그 방식으로 교체 가능)
    this._invalidateCache();

    for (const system of this._systems) {
      const entities = this._queryCache.get(system) ?? [];
      system.update(entities, delta);
    }
  }

  destroy(): void {
    this._systems.forEach((s) => s.onDestroy?.());
    this._systems = [];
    this._entities.clear();
    this._queryCache.clear();
    this.bus.clear();
  }

  // ──────────────────────────────────────────────
  // 내부 유틸
  // ──────────────────────────────────────────────

  private _buildQuery(system: System<Events>): Entity[] {
    // query가 비어있으면 모든 entity를 반환 (SkillSystem 등 범용 시스템)
    if (system.query.length === 0) return [...this._entities.values()];
    return [...this._entities.values()].filter((e) => e.hasAll(system.query));
  }

  private _invalidateCache(): void {
    for (const system of this._systems) {
      this._queryCache.set(system, this._buildQuery(system));
    }
  }

  private _flushRemovals(): void {
    if (this._pendingRemove.size === 0) return;
    this._pendingRemove.forEach((id) => this._entities.delete(id));
    this._pendingRemove.clear();
    this._invalidateCache();
  }
}
