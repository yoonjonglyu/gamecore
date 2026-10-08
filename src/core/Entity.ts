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

  constructor(tags: string[] = []) {
    this.id = Entity._nextId++;
    tags.forEach((t) => this.tags.add(t));
  }

  // ──────────────────────────────────────────────
  // Component CRUD
  // ──────────────────────────────────────────────

  add<T extends Component>(component: T): this {
    component.entityId = this.id;
    this._components.set(component.constructor as ComponentType, component);
    return this;
  }

  get<T extends Component>(type: ComponentType<T>): T | undefined {
    return this._components.get(type) as T | undefined;
  }

  has<T extends Component>(type: ComponentType<T>): boolean {
    return this._components.has(type);
  }

  remove<T extends Component>(type: ComponentType<T>): boolean {
    return this._components.delete(type);
  }

  hasAll(types: ComponentType[]): boolean {
    return types.every((t) => this._components.has(t));
  }
}
