/**
 * @module World
 * ECS의 중심 — Entity 생성/삭제, System 등록, 게임 루프를 관리한다.
 * EventBus를 내장하여 System 간 통신을 중재한다.
 */

import { Component, ComponentType } from './Component';
import { Entity, EntityWorldEmitter } from './Entity';
import { EventBus, EventMap } from './EventBus';
import { System } from './System';
import { SeededRandom } from '../math/SeededRandom';
import { Blackboard } from './Blackboard';
import { TimerScheduler, ScheduledTask } from './TimerScheduler';
import { sha256 } from '../serialization/crypto';
import { defaultComponentRegistry } from '../serialization/ComponentRegistry';

export type QueryCacheMode = 'auto' | 'always';

export interface WorldOptions<Events extends EventMap = EventMap> {
  bus?: EventBus<Events>;
  seed?: number | string;
  random?: SeededRandom;
  blackboard?: Blackboard;
  scheduler?: TimerScheduler;
  /** 쿼리 캐시 갱신 전략 ('auto': dirty 시에만 재빌드, 'always': 매 틱 전체 풀스캔 재빌드). 기본값: 'auto' */
  queryCacheMode?: QueryCacheMode;
  /** 시간 배속 (기본값: 1.0) */
  timeScale?: number;
  /** 일시정지 여부 (기본값: false) */
  isPaused?: boolean;
}

export class World<Events extends EventMap = EventMap> implements EntityWorldEmitter {
  readonly bus: EventBus<Events>;
  /** 결정론적 난수 생성기 (Seeded PRNG) */
  readonly random: SeededRandom;
  /** 전역 게임 상태 & 플래그 저장소 */
  readonly blackboard: Blackboard;
  /** 시간 및 턴 기반 지연/반복 스케줄러 */
  readonly scheduler: TimerScheduler;

  /** 쿼리 캐시 갱신 전략 */
  queryCacheMode: QueryCacheMode = 'auto';
  /** 시간 배속 (배속 연산, 슬로우모션 등) */
  timeScale: number = 1.0;
  /** 일시정지 여부 */
  isPaused: boolean = false;

  /** bus의 편의 별칭 */
  get events(): EventBus<Events> {
    return this.bus;
  }

  private _entities: Map<number, Entity> = new Map();
  private _nextEntityId: number = 0;
  private _systems: System<Events>[] = [];
  /** System이 처리할 entity 캐시 (query → entities) */
  private _queryCache: Map<System<Events>, Entity[]> = new Map();
  /** 쿼리 캐시 갱신 필요 여부 플래그 */
  private _isCacheDirty: boolean = true;
  /** 다음 틱에 삭제될 entity ID 목록 (지연 삭제) */
  private _pendingRemove: Set<number> = new Set();

  /** 대량 업데이트 시 이벤트 배치 발행 플래그 */
  private _isBatching = false;
  private _batchedComponentUpdates: Map<string, { entityId: number; componentName: string; component: Component }> = new Map();
  private _batchedComponentRemovals: Map<string, { entityId: number; componentName: string }> = new Map();

  /** 월드 상태 버전 카운터 (React 바인딩 등 스냅샷 비교용) */
  version: number = 0;
  private _listeners: Set<WorldListener> = new Set();
  private _bbUnsub?: () => void;

  constructor(busOrOptions?: EventBus<Events> | WorldOptions<Events>, seed?: number | string) {
    if (busOrOptions && 'emit' in busOrOptions && typeof (busOrOptions as any).emit === 'function') {
      this.bus = busOrOptions as EventBus<Events>;
      this.random = new SeededRandom(seed ?? Date.now());
      this.blackboard = new Blackboard();
      this.scheduler = new TimerScheduler();
    } else if (busOrOptions && typeof busOrOptions === 'object') {
      const opts = busOrOptions as WorldOptions<Events>;
      this.bus = opts.bus ?? new EventBus<Events>();
      this.random = opts.random ?? new SeededRandom(opts.seed ?? seed ?? Date.now());
      this.blackboard = opts.blackboard ?? new Blackboard();
      this.scheduler = opts.scheduler ?? new TimerScheduler();
      if (opts.queryCacheMode) this.queryCacheMode = opts.queryCacheMode;
      if (opts.timeScale !== undefined) {
        this.timeScale = Number.isFinite(opts.timeScale) ? Math.max(0, opts.timeScale) : 1.0;
      }
      if (opts.isPaused !== undefined) this.isPaused = opts.isPaused;
    } else {
      this.bus = new EventBus<Events>();
      this.random = new SeededRandom(seed ?? Date.now());
      this.blackboard = new Blackboard();
      this.scheduler = new TimerScheduler();
    }

    // 전역 블랙보드 변경 시 버스로 이벤트 전파
    this._bbUnsub = this.blackboard.subscribe((key, prev, next) => {
      (this.bus as any).emit('blackboard:changed', { key, prev, next });
    });
  }

  // ──────────────────────────────────────────────
  // Time Scaling & Pause Controls
  // ──────────────────────────────────────────────

  /**
   * 게임 월드의 시간 진행 배속을 설정합니다 (예: 1.0 = 정상, 2.0 = 2배속, 0.5 = 슬로우모션).
   */
  setTimeScale(scale: number): this {
    this.timeScale = Number.isFinite(scale) ? Math.max(0, scale) : this.timeScale;
    return this;
  }

  /**
   * 게임 월드의 일시정지 상태를 설정합니다.
   */
  setPaused(paused: boolean): this {
    this.isPaused = paused;
    return this;
  }

  /**
   * 게임 월드를 일시정지합니다.
   */
  pause(): this {
    return this.setPaused(true);
  }

  /**
   * 게임 월드의 일시정지를 해제하고 재개합니다.
   */
  resume(): this {
    return this.setPaused(false);
  }

  // ──────────────────────────────────────────────
  // Query Cache Invalidation
  // ──────────────────────────────────────────────

  /**
   * 시스템 쿼리 캐시를 무효화하여 다음 틱 또는 필요 시 재빌드하도록 표시합니다.
   */
  invalidateCache(): void {
    this._isCacheDirty = true;
    if (this.queryCacheMode === 'always') {
      this._rebuildQueryCache();
    }
  }

  // ──────────────────────────────────────────────
  // Scheduler Helpers
  // ──────────────────────────────────────────────

  /**
   * 지정된 밀리초(ms) 후에 콜백을 1회 실행하도록 예약합니다.
   */
  schedule(delayMs: number, callback: () => void): ScheduledTask {
    return this.scheduler.schedule(delayMs, callback);
  }

  /**
   * 지정된 밀리초(ms) 주기마다 콜백을 반복 실행하도록 예약합니다.
   */
  scheduleEvery(intervalMs: number, callback: () => void, times?: number): ScheduledTask {
    return this.scheduler.scheduleEvery(intervalMs, callback, times);
  }

  /**
   * 지정된 턴(turn) 경과 후에 콜백을 1회 실행하도록 예약합니다.
   */
  scheduleTurns(turns: number, callback: () => void): ScheduledTask {
    return this.scheduler.scheduleTurns(turns, callback);
  }

  /**
   * 지정된 턴(turn) 주기마다 콜백을 반복 실행하도록 예약합니다.
   */
  scheduleTurnsEvery(intervalTurns: number, callback: () => void, times?: number): ScheduledTask {
    return this.scheduler.scheduleTurnsEvery(intervalTurns, callback, times);
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
    for (const listener of Array.from(this._listeners)) {
      listener(this, event);
    }
  }

  // ──────────────────────────────────────────────
  // Reactive Component Events & Batching
  // ──────────────────────────────────────────────

  /**
   * 대량 연산 시 이벤트를 배치로 지연 발행하여 불필요한 반복 렌더링/리스너 호출을 방지한다.
   * 배치 블록 종료 시 중복된 컴포넌트 변경은 마지막 1회로 통합(Deduplication)되어 일괄 발행된다.
   */
  batchUpdates(fn: () => void): void {
    const wasBatching = this._isBatching;
    this._isBatching = true;
    try {
      fn();
    } finally {
      this._isBatching = wasBatching;
      if (!this._isBatching) {
        this._flushBatchedEvents();
      }
    }
  }

  emitComponentUpdated(entityId: number, componentName: string, component: Component): void {
    this.invalidateCache();
    this.notifyChange({ type: 'component_changed', entity: this._entities.get(entityId) });
    if (this._isBatching) {
      const key = `${entityId}:${componentName}`;
      this._batchedComponentRemovals.delete(key);
      this._batchedComponentUpdates.set(key, { entityId, componentName, component });
      return;
    }
    (this.bus as any).emit('ecs:component:updated', { entityId, componentName, component });
  }

  emitComponentRemoved(entityId: number, componentName: string): void {
    this.invalidateCache();
    this.notifyChange({ type: 'component_changed', entity: this._entities.get(entityId) });
    if (this._isBatching) {
      const key = `${entityId}:${componentName}`;
      this._batchedComponentUpdates.delete(key);
      this._batchedComponentRemovals.set(key, { entityId, componentName });
      return;
    }
    (this.bus as any).emit('ecs:component:removed', { entityId, componentName });
  }

  private _flushBatchedEvents(): void {
    const updates = Array.from(this._batchedComponentUpdates.values());
    this._batchedComponentUpdates.clear();
    const removals = Array.from(this._batchedComponentRemovals.values());
    this._batchedComponentRemovals.clear();

    for (const update of updates) {
      (this.bus as any).emit('ecs:component:updated', update);
    }
    for (const removal of removals) {
      (this.bus as any).emit('ecs:component:removed', removal);
    }
  }

  // ──────────────────────────────────────────────
  // Entity 관리
  // ──────────────────────────────────────────────

  createEntity(...tags: string[]): Entity {
    while (this._entities.has(this._nextEntityId) || this._pendingRemove.has(this._nextEntityId)) {
      this._nextEntityId++;
    }
    const entity = new Entity(tags, this._nextEntityId++);
    entity._bindWorld(this);
    this._entities.set(entity.id, entity);
    this.invalidateCache();
    this.notifyChange({ type: 'entity_created', entity });
    return entity;
  }

  /**
   * 지정된 고유 ID로 엔티티를 생성합니다 (역직렬화 및 델타 동기화용).
   */
  createEntityWithId(id: number, ...tags: string[]): Entity {
    this._pendingRemove.delete(id);
    if (Number.isFinite(id)) {
      this._nextEntityId = Math.max(this._nextEntityId, id + 1);
    }
    const existing = this._entities.get(id);
    if (existing) {
      existing._bindWorld(undefined);
      existing.clearListeners();
    }
    const entity = new Entity(tags, id);
    entity._bindWorld(this);
    this._entities.set(entity.id, entity);
    this.invalidateCache();
    this.notifyChange({ type: 'entity_created', entity });
    return entity;
  }

  removeEntity(id: number): void {
    this._pendingRemove.add(id);
  }

  /**
   * 엔티티를 월드에서 파괴/제거합니다 (removeEntity의 별칭).
   */
  destroyEntity(entityOrId: Entity | number): void {
    const id = typeof entityOrId === 'number' ? entityOrId : entityOrId.id;
    this.removeEntity(id);
  }

  /**
   * 월드의 모든 엔티티를 일괄 삭제한다. (스테이지 전환, 새 게임 등)
   * 시스템과 EventBus는 유지된다.
   */
  clearEntities(): void {
    for (const entity of this._entities.values()) {
      entity.clear();
      entity._bindWorld(undefined);
    }
    this._entities.clear();
    this._pendingRemove.clear();
    this.invalidateCache();
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
    if (this._systems.includes(system)) {
      return this;
    }
    system._init(this.bus);
    this._systems.push(system);
    // 우선순위(priority) 높은 순 정렬
    this._systems.sort((a, b) => b.priority - a.priority);
    this._queryCache.set(system, this._buildQuery(system));
    return this;
  }

  removeSystem(system: System<Events>): void {
    const idx = this._systems.indexOf(system);
    if (idx === -1) return;
    system.onDestroy?.();
    this._systems.splice(idx, 1);
    this._queryCache.delete(system);
  }

  hasSystem<T extends System<Events>>(systemClass: new (...args: any[]) => T): boolean {
    return this._systems.some((s) => s instanceof systemClass);
  }

  getSystem<T extends System<Events>>(systemClass: new (...args: any[]) => T): T | undefined {
    return this._systems.find((s): s is T => s instanceof systemClass);
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
    if (this.isPaused) {
      return;
    }

    const rawDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const effectiveDelta = mode === 'realtime' ? rawDelta * this.timeScale : rawDelta;

    // 지연 삭제 처리 (스케줄러 콜백 전에 먼저 플러시하여 이미 삭제된 엔티티 참조 방지)
    this._flushRemovals();

    // 스케줄러 틱 실행 (시간 또는 턴)
    this.scheduler.update(effectiveDelta, mode === 'turn' ? 'turn' : 'time');

    // 스케줄러 콜백에서 삭제 예약된 엔티티가 있을 수 있으므로 재플러시
    this._flushRemovals();

    // 쿼리 캐시 갱신 (always 모드이거나 dirty 플래그 활성화 시)
    if (this.queryCacheMode === 'always' || this._isCacheDirty) {
      this._rebuildQueryCache();
      this._isCacheDirty = false;
    }

    for (const system of [...this._systems]) {
      if (!system.enabled) continue; // 일시정지된 시스템 스킵
      if (this._isCacheDirty) {
        this._rebuildQueryCache();
        this._isCacheDirty = false;
      }
      const entities = this._queryCache.get(system) ?? [];
      system.update(entities, effectiveDelta, mode);
    }
  }

  destroy(): void {
    this._bbUnsub?.();
    this._bbUnsub = undefined;
    this.scheduler.clear();
    this._systems.forEach((s) => s.onDestroy?.());
    this._systems = [];
    for (const entity of this._entities.values()) {
      entity._bindWorld(undefined);
      entity.clearListeners();
    }
    this._entities.clear();
    this._pendingRemove.clear();
    this._batchedComponentUpdates.clear();
    this._batchedComponentRemovals.clear();
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

  private _rebuildQueryCache(): void {
    for (const system of this._systems) {
      this._queryCache.set(system, this._buildQuery(system));
    }
  }

  /**
   * 예약된 지연 엔티티 삭제 큐를 즉시 플러시(정리)합니다.
   */
  flushRemovals(): void {
    this._flushRemovals();
  }

  private _flushRemovals(): void {
    if (this._pendingRemove.size === 0) return;
    const toRemove = Array.from(this._pendingRemove);
    this._pendingRemove.clear();
    for (const id of toRemove) {
      const entity = this._entities.get(id);
      if (entity) {
        entity._bindWorld(undefined);
        entity.clearListeners();
        this._entities.delete(id);
        this.notifyChange({ type: 'entity_removed', entity });
      }
    }
    this.invalidateCache();
  }

  /**
   * 월드의 전체 상태(정규화된 엔티티, 컴포넌트 데이터, 전역 블랙보드, PRNG 상태)를 기반으로
   * 64자리 결정론적 무결성 해시(SHA-256)를 산출합니다.
   * 멀티플레이어 디싱크(Desync) 실시간 감지 및 리플레이 체크포인트 검증에 활용됩니다.
   */
  hash(options?: { includePrngState?: boolean }): string {
    const includePrng = options?.includePrngState ?? true;

    const compareCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

    const canonicalize = (val: unknown): unknown => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'bigint') return val.toString();
      if (typeof val !== 'object') return val;
      if (Array.isArray(val)) {
        return val.map((item) => canonicalize(item));
      }
      if (val instanceof Set) {
        return Array.from(val)
          .map((item) => canonicalize(item))
          .sort((a, b) => compareCodePoint(JSON.stringify(a) ?? '', JSON.stringify(b) ?? ''));
      }
      if (val instanceof Map) {
        return Array.from(val.entries())
          .map(([k, v]) => [String(k), canonicalize(v)] as [string, unknown])
          .sort((a, b) => compareCodePoint(a[0], b[0]));
      }
      const record = val as Record<string, unknown>;
      const sortedObj: Record<string, unknown> = {};
      for (const k of Object.keys(record).sort(compareCodePoint)) {
        const v = record[k];
        if (typeof v !== 'function' && v !== undefined) {
          sortedObj[k] = canonicalize(v);
        }
      }
      return sortedObj;
    };

    // 1. 엔티티 정렬 및 컴포넌트 정규화 (삭제 대기 제외)
    const sortedEntityIds = Array.from(this._entities.keys())
      .filter((id) => !this._pendingRemove.has(id))
      .sort((a, b) => a - b);

    const entitiesSummary = sortedEntityIds.map((id) => {
      const ent = this._entities.get(id)!;
      const comps = ent.allComponents
        .map((c) => {
          const serialized = defaultComponentRegistry.serializeComponent(c);
          if (serialized) {
            return {
              type: serialized.type,
              data: canonicalize(serialized.data),
            };
          }
          const typeName = c.constructor.name;
          const plainData: Record<string, unknown> = {};
          for (const key of Object.keys(c).sort(compareCodePoint)) {
            if (!key.startsWith('_') && key !== 'entity' && key !== 'entityId') {
              plainData[key] = (c as any)[key];
            }
          }
          return { type: typeName, data: canonicalize(plainData) };
        })
        .sort((a, b) => compareCodePoint(a.type, b.type));

      return {
        id: ent.id,
        tags: Array.from(ent.tags).sort(compareCodePoint),
        components: comps,
      };
    });

    // 2. 블랙보드 정규화
    const bbObj = canonicalize(this.blackboard.toRecord());

    // 3. PRNG 상태 (선택)
    const prng = includePrng ? canonicalize(this.random.exportState()) : null;

    const canonicalPayload = JSON.stringify({
      entities: entitiesSummary,
      blackboard: bbObj,
      prng,
    });

    return sha256(canonicalPayload);
  }
}

export interface WorldChangeEvent {
  type: 'entity_created' | 'entity_removed' | 'entities_cleared' | 'component_changed';
  entity?: Entity;
}

export type WorldListener = (world: World<any>, event: WorldChangeEvent) => void;


