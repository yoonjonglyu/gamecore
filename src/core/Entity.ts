/**
 * @module Entity
 * ECS의 E — 컴포넌트들의 컨테이너. ID와 컴포넌트 맵만 가진다.
 * 생성/관리는 World가 담당.
 */

import { Component, ComponentType } from './Component';

export class Entity {
  private static _nextId = 0;

  readonly id: number;
  private _components: Map<ComponentType, Component> = new Map();
  /** 태그 기반 빠른 쿼리용 (예: "player", "enemy") */
  readonly tags: Set<string> = new Set();

  /** 상태 변경 버전 카운터 (React useSyncExternalStore 등의 스냅샷용) */
  version: number = 0;
  private _listeners: Set<EntityListener> = new Set();
  /** 소속 World의 이벤트 이미터 참조 */
  private _worldEmitter?: EntityWorldEmitter;

  constructor(tags: string[] = []) {
    this.id = Entity._nextId++;
    tags.forEach((t) => this.tags.add(t));
  }

  /** @internal World 등록 시 자동 바인딩 */
  _bindWorld(world: EntityWorldEmitter): this {
    this._worldEmitter = world;
    return this;
  }

  /** 소속 World 인스턴스 (바인딩되어 있는 경우) */
  get world(): any {
    return this._worldEmitter;
  }

  // ──────────────────────────────────────────────
  // Observer / Subscription
  // ──────────────────────────────────────────────

  /**
   * 엔티티의 컴포넌트 또는 태그 변경을 구독한다.
   * 외부 라이브러리(React 등)에 의존하지 않는 표준 옵저버 메서드.
   * @returns 구독 해제 함수 (unsubscribe)
   */
  subscribe(listener: EntityListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * 엔티티 상태 변경을 알리고 버전을 증가시킨다.
   */
  notifyChange(change: EntityChange): void {
    this.version++;
    for (const listener of this._listeners) {
      listener(this, change);
    }
  }

  /**
   * 컴포넌트 내부 필드 값이 수정되었을 때 명시적으로 변경을 알린다.
   * 옵저버와 World의 EventBus(ecs:component:updated)에 변경이 전파된다.
   */
  notifyUpdated<T extends Component>(type: ComponentType<T>): void {
    const comp = this.get(type);
    if (comp) {
      this.notifyChange({ type: 'component_changed', componentType: type, component: comp });
      this._worldEmitter?.emitComponentUpdated(this.id, type.name, comp);
    }
  }

  // ──────────────────────────────────────────────
  // Tag CRUD
  // ──────────────────────────────────────────────

  hasTag(tag: string): boolean {
    return this.tags.has(tag);
  }

  addTag(tag: string): this {
    if (!this.tags.has(tag)) {
      this.tags.add(tag);
      this.notifyChange({ type: 'tag_added', tag });
    }
    return this;
  }

  removeTag(tag: string): boolean {
    const deleted = this.tags.delete(tag);
    if (deleted) {
      this.notifyChange({ type: 'tag_removed', tag });
    }
    return deleted;
  }

  // ──────────────────────────────────────────────
  // Component CRUD
  // ──────────────────────────────────────────────

  add<T extends Component>(component: T): this {
    component.entityId = this.id;
    component.entity = this;
    const type = component.constructor as ComponentType;
    this._components.set(type, component);
    this.notifyChange({ type: 'component_added', componentType: type, component });
    this._worldEmitter?.emitComponentUpdated(this.id, type.name, component);
    return this;
  }

  get<T extends Component>(type: ComponentType<T>): T | undefined {
    return this._components.get(type) as T | undefined;
  }

  has<T extends Component>(type: ComponentType<T>): boolean {
    return this._components.has(type);
  }

  remove<T extends Component>(type: ComponentType<T>): boolean {
    const comp = this._components.get(type);
    const deleted = this._components.delete(type);
    if (deleted) {
      if (comp) {
        comp.entityId = -1;
        comp.entity = undefined;
      }
      this.notifyChange({ type: 'component_removed', componentType: type, component: comp });
      this._worldEmitter?.emitComponentRemoved(this.id, type.name);
    }
    return deleted;
  }

  /** 엔티티 ID 생성 카운터를 리셋한다 (테스트 격리 또는 새 게임 시작용) */
  static resetIdCounter(startId = 0): void {
    Entity._nextId = startId;
  }

  hasAll(types: ComponentType[]): boolean {
    return types.every((t) => this._components.has(t));
  }

  get allComponents(): Component[] {
    return [...this._components.values()];
  }

  /**
   * 엔티티의 모든 컴포넌트를 일괄 제거한다.
   */
  removeAllComponents(): this {
    if (this._components.size === 0) return this;
    const removedComps = [...this._components.values()];
    this._components.clear();
    this.notifyChange({ type: 'component_removed', payload: removedComps });
    if (this._worldEmitter) {
      for (const comp of removedComps) {
        this._worldEmitter.emitComponentRemoved(this.id, comp.constructor.name);
      }
    }
    return this;
  }

  /**
   * 엔티티의 모든 태그를 일괄 제거한다.
   */
  clearTags(): this {
    if (this.tags.size === 0) return this;
    this.tags.clear();
    this.notifyChange({ type: 'tag_removed' });
    return this;
  }

  /**
   * 엔티티의 모든 컴포넌트와 태그를 일괄 초기화한다. (오브젝트 풀링/리사이클용)
   */
  clear(): this {
    const removedComps = [...this._components.values()];
    this._components.clear();
    this.tags.clear();
    this.notifyChange({ type: 'cleared' });
    if (this._worldEmitter) {
      for (const comp of removedComps) {
        this._worldEmitter.emitComponentRemoved(this.id, comp.constructor.name);
      }
    }
    return this;
  }

  /**
   * 등록된 모든 옵저버 구독자를 해제한다.
   */
  clearListeners(): this {
    this._listeners.clear();
    return this;
  }
}

export interface EntityWorldEmitter {
  emitComponentUpdated(entityId: number, componentName: string, component: Component): void;
  emitComponentRemoved(entityId: number, componentName: string): void;
}

export type EntityChangeType =
  | 'component_added'
  | 'component_removed'
  | 'component_changed'
  | 'tag_added'
  | 'tag_removed'
  | 'cleared';


export interface EntityChange {
  type: EntityChangeType;
  componentType?: ComponentType;
  component?: Component;
  tag?: string;
  field?: string;
  prev?: any;
  next?: any;
  payload?: any;
}

export type EntityListener = (entity: Entity, change: EntityChange) => void;

