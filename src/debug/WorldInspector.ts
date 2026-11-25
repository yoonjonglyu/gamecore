/**
 * @module debug/WorldInspector
 * 헤드리스 GameCore 월드의 엔티티/컴포넌트/블랙보드 상태를 읽기 전용 JSON으로 스냅샷 검사하고,
 * 두 월드 간의 상태 차이(diff) 및 이벤트 타임라인을 추적하는 경량 디버깅 인스펙터.
 */

import { Entity } from '../core/Entity';
import { World } from '../core/World';
import { EventMap } from '../core/EventBus';
import { defaultComponentRegistry } from '../serialization/ComponentRegistry';

export interface EntityInspection {
  id: number;
  tags: string[];
  version: number;
  components: Record<string, Record<string, unknown>>;
}

export interface WorldInspection {
  version: number;
  entityCount: number;
  hash?: string;
  isPaused: boolean;
  timeScale: number;
  blackboard: Record<string, unknown>;
  entities: EntityInspection[];
}

export interface EntityDiffDetail {
  entityId: number;
  addedTags: string[];
  removedTags: string[];
  changedComponents: string[];
}

export interface WorldDiffResult {
  equal: boolean;
  hashA: string;
  hashB: string;
  addedEntityIds: number[];
  removedEntityIds: number[];
  changedEntities: EntityDiffDetail[];
  blackboardDiff: {
    added: string[];
    removed: string[];
    changed: string[];
  };
}

export interface EventTimelineEntry {
  seq: number;
  event: string;
  payload: unknown;
}

export interface WorldInspectorOptions {
  /** 보관할 최대 이벤트 타임라인 수. 기본값: 200 */
  maxEvents?: number;
}

function safeSnapshotValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

export class WorldInspector<Events extends EventMap = Record<string, any>> {
  readonly world: World<Events>;
  readonly maxEvents: number;
  private _timeline: EventTimelineEntry[] = [];
  private _unsubscribers: Map<string, () => void> = new Map();
  private _seq = 0;

  constructor(world: World<Events>, options: WorldInspectorOptions = {}) {
    this.world = world;
    this.maxEvents =
      Number.isFinite(options.maxEvents) && options.maxEvents! >= 1
        ? Math.floor(options.maxEvents!)
        : 200;
  }

  static inspectEntity(entity: Entity): EntityInspection {
    const components: Record<string, Record<string, unknown>> = {};
    const sortedComps = [...entity.allComponents].sort((a, b) =>
      a.constructor.name.localeCompare(b.constructor.name),
    );

    for (const comp of sortedComps) {
      const serialized = defaultComponentRegistry.serializeComponent(comp);
      if (serialized) {
        components[serialized.type] = safeSnapshotValue(serialized.data);
      } else {
        const typeName = comp.constructor.name;
        const data: Record<string, unknown> = {};
        for (const key of Object.keys(comp).sort()) {
          if (!key.startsWith('_') && key !== 'entity' && key !== 'entityId') {
            data[key] = safeSnapshotValue((comp as any)[key]);
          }
        }
        components[typeName] = data;
      }
    }

    return {
      id: entity.id,
      tags: Array.from(entity.tags).sort(),
      version: entity.version,
      components,
    };
  }

  static inspectWorld(
    world: World<any>,
    options: { tag?: string; includeHash?: boolean } = {},
  ): WorldInspection {
    const sourceEntities = options.tag ? world.queryByTag(options.tag) : world.entities;
    const entities = [...sourceEntities]
      .sort((a, b) => a.id - b.id)
      .map((e) => WorldInspector.inspectEntity(e));

    return {
      version: world.version,
      entityCount: entities.length,
      hash: options.includeHash ? world.hash() : undefined,
      isPaused: world.isPaused,
      timeScale: world.timeScale,
      blackboard: safeSnapshotValue(world.blackboard.toRecord()),
      entities,
    };
  }

  static diffWorlds(worldA: World<any>, worldB: World<any>): WorldDiffResult {
    const hashA = worldA.hash();
    const hashB = worldB.hash();

    const mapA = new Map(worldA.entities.map((e) => [e.id, WorldInspector.inspectEntity(e)]));
    const mapB = new Map(worldB.entities.map((e) => [e.id, WorldInspector.inspectEntity(e)]));

    const addedEntityIds: number[] = [];
    const removedEntityIds: number[] = [];
    const changedEntities: EntityDiffDetail[] = [];

    for (const id of mapB.keys()) {
      if (!mapA.has(id)) addedEntityIds.push(id);
    }
    for (const id of mapA.keys()) {
      if (!mapB.has(id)) {
        removedEntityIds.push(id);
        continue;
      }
      const a = mapA.get(id)!;
      const b = mapB.get(id)!;

      const setA = new Set(a.tags);
      const setB = new Set(b.tags);
      const addedTags = b.tags.filter((t) => !setA.has(t));
      const removedTags = a.tags.filter((t) => !setB.has(t));

      const compNames = new Set([...Object.keys(a.components), ...Object.keys(b.components)]);
      const changedComponents: string[] = [];
      for (const name of Array.from(compNames).sort()) {
        if (JSON.stringify(a.components[name]) !== JSON.stringify(b.components[name])) {
          changedComponents.push(name);
        }
      }

      if (addedTags.length > 0 || removedTags.length > 0 || changedComponents.length > 0) {
        changedEntities.push({
          entityId: id,
          addedTags,
          removedTags,
          changedComponents,
        });
      }
    }

    addedEntityIds.sort((a, b) => a - b);
    removedEntityIds.sort((a, b) => a - b);
    changedEntities.sort((a, b) => a.entityId - b.entityId);

    const bbA = worldA.blackboard.toRecord();
    const bbB = worldB.blackboard.toRecord();
    const bbKeys = new Set([...Object.keys(bbA), ...Object.keys(bbB)]);
    const bbAdded: string[] = [];
    const bbRemoved: string[] = [];
    const bbChanged: string[] = [];

    for (const k of Array.from(bbKeys).sort()) {
      const hasA = Object.prototype.hasOwnProperty.call(bbA, k);
      const hasB = Object.prototype.hasOwnProperty.call(bbB, k);
      if (!hasA && hasB) bbAdded.push(k);
      else if (hasA && !hasB) bbRemoved.push(k);
      else if (JSON.stringify(bbA[k]) !== JSON.stringify(bbB[k])) bbChanged.push(k);
    }

    return {
      equal: hashA === hashB,
      hashA,
      hashB,
      addedEntityIds,
      removedEntityIds,
      changedEntities,
      blackboardDiff: {
        added: bbAdded,
        removed: bbRemoved,
        changed: bbChanged,
      },
    };
  }

  attach(eventNames: Array<keyof Events | string>): this {
    for (const name of eventNames) {
      const key = String(name);
      if (this._unsubscribers.has(key)) continue;
      const unsub = (this.world.bus as any).on(key, (payload: unknown) => {
        this._timeline.push({
          seq: ++this._seq,
          event: key,
          payload: safeSnapshotValue(payload),
        });
        if (this._timeline.length > this.maxEvents) {
          this._timeline.shift();
        }
      });
      this._unsubscribers.set(key, unsub);
    }
    return this;
  }

  getTimeline(): readonly EventTimelineEntry[] {
    return [...this._timeline];
  }

  clearTimeline(): void {
    this._timeline = [];
  }

  snapshot(options?: { tag?: string; includeHash?: boolean }): WorldInspection {
    return WorldInspector.inspectWorld(this.world, options);
  }

  destroy(): void {
    for (const unsub of this._unsubscribers.values()) {
      unsub();
    }
    this._unsubscribers.clear();
  }
}
