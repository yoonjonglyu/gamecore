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

  /** 월드 상태 버전 카운터 (React 바인딩 등 스냅샷 비교용) */
  version: number = 0;
  private _listeners: Set<WorldListener> = new Set();

  constructor(bus?: EventBus<Events>) {
    this.bus = bus ?? new EventBus<Events>();
  }

  // ──────────────────────────────────────────────
  // Observer / Subscription
  // ──────────────────────────────────────────────

  /**
   * 월드의 엔티티 생성/삭제 이벤트를 구독한다.
   * 외부 라이브러리(React 등)에 의존하지 않는 표준 옵저버 메서드.
   * @returns 구독 해제 함수 (unsubscribe)
   */
  subscribe(listener: WorldListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  notifyChange(event: WorldChangeEvent): void {
    this.version++;
    for (const listener of this._listeners) {
      listener(this, event);
    }
  }

  // ──────────────────────────────────────────────
  // Entity 관리
  // ──────────────────────────────────────────────

  createEntity(...tags: string[]): Entity {
    const entity = new Entity(tags);
    this._entities.set(entity.id, entity);
    this._invalidateCache();
    this.notifyChange({ type: 'entity_created', entity });
    return entity;
  }


  removeEntity(id: number): void {
    this._pendingRemove.add(id);
  }

  /**
   * 월드의 모든 엔티티를 일괄 삭제한다. (스테이지 전환, 새 게임 등)
   * 시스템과 EventBus는 유지된다.
   */
  clearEntities(): void {
    for (const entity of this._entities.values()) {
      entity.clear();
    }
    this._entities.clear();
    this._pendingRemove.clear();
    this._invalidateCache();
    this.notifyChange({ type: 'entities_cleared' });
  }

  getEntity(id: number): Entity | undefined {
    return this._entities.get(id);
  }

  hasEntity(id: number): boolean {
    return this._entities.has(id);
  }

  get entities(): Entity[] {
    return [...this._entities.values()];
  }

  /** 현재 월드 내 활성 엔티티 총 개수 (O(1)) */
  get entityCount(): number {
    return this._entities.size;
  }

  queryEntities(types: ComponentType[]): Entity[] {
    return [...this._entities.values()].filter((e) => e.hasAll(types));
  }

  /** 해당 컴포넌트들을 모두 가진 첫 번째 엔티티 (단일 플레이어/보스 조회용) */
  queryFirst(types: ComponentType[]): Entity | undefined {
    for (const entity of this._entities.values()) {
      if (entity.hasAll(types)) return entity;
    }
    return undefined;
  }

  queryByTag(tag: string): Entity[] {
    return [...this._entities.values()].filter((e) => e.tags.has(tag));
  }

  /** 특정 태그를 가진 첫 번째 엔티티 */
  queryByTagFirst(tag: string): Entity | undefined {
    for (const entity of this._entities.values()) {
      if (entity.tags.has(tag)) return entity;
    }
    return undefined;
  }

  /** 임의 조건식을 만족하는 첫 번째 엔티티 탐색 */
  findEntity(predicate: (e: Entity) => boolean): Entity | undefined {
    for (const entity of this._entities.values()) {
      if (predicate(entity)) return entity;
    }
    return undefined;
  }

  /** 특정 태그를 가진 모든 엔티티를 일괄 삭제 예약 */
  removeEntitiesByTag(tag: string): number {
    let count = 0;
    for (const entity of this._entities.values()) {
      if (entity.tags.has(tag)) {
        this.removeEntity(entity.id);
        count++;
      }
    }
    return count;
  }

  // ──────────────────────────────────────────────
  // System 관리
  // ──────────────────────────────────────────────

  addSystem(system: System<Events>): this {
    system._init(this.bus);
    this._systems.push(system);
    // 우선순위(priority) 높은 순 정렬
    this._systems.sort((a, b) => b.priority - a.priority);
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
   * @param delta 마지막 틱 이후 경과 시간 (ms 또는 s, 게임에서 통일. 턴제의 경우 턴 수)
   * @param mode 실행 모드 ('realtime' | 'turn')
   */
  update(delta: number, mode: 'turn' | 'realtime' = 'realtime'): void {
    // 지연 삭제 처리
    this._flushRemovals();
    // 컴포넌트 추가/제거 후 캐시가 stale해질 수 있으므로 매 틱 재빌드
    this._invalidateCache();

    for (const system of this._systems) {
      if (!system.enabled) continue; // 일시정지된 시스템 스킵
      const entities = this._queryCache.get(system) ?? [];
      system.update(entities, delta, mode);
    }
  }

  destroy(): void {
    this._systems.forEach((s) => s.onDestroy?.());
    this._systems = [];
    this._entities.clear();
    this._queryCache.clear();
    this._listeners.clear();
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
    for (const id of this._pendingRemove) {
      const entity = this._entities.get(id);
      if (entity) {
        this._entities.delete(id);
        this.notifyChange({ type: 'entity_removed', entity });
      }
    }
    this._pendingRemove.clear();
    this._invalidateCache();
  }
}

export interface WorldChangeEvent {
  type: 'entity_created' | 'entity_removed' | 'entities_cleared';
  entity?: Entity;
}

export type WorldListener = (world: World<any>, event: WorldChangeEvent) => void;


