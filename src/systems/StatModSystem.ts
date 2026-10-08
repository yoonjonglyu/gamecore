/**
 * @module systems/StatModSystem
 * StatModsComponent를 가진 Entity의 스탯 변화 수명을 관리한다.
 *
 * 역할:
 *  1. 매 틱(update) 활성 StatModifier의 duration 감소
 *  2. 만료된 modifier 제거 + stat_mod:expired 이벤트 발행
 *  3. 외부 요청(addMod / removeMod)으로 즉시 추가·제거
 *
 * CombatSystem / SkillSystem은 StatModsComponent에 직접 쓰지 않고
 * 이 시스템의 addMod를 통해 변화를 부여한다.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { StatModsComponent, StatModifier } from '../components/StatModsComponent';

export interface AddModRequest {
  entityId: number;
  mod: StatModifier;
}

export interface RemoveModRequest {
  entityId: number;
  sourceId: string;
}

export class StatModSystem extends System<CoreEvents> {
  /**
   * query = [] → 모든 entity를 받는다.
   * addMod가 StatModsComponent 없는 entity에 자동 생성할 수 있어야 하기 때문.
   */
  readonly query: ComponentType[] = [];

  private _addQueue: AddModRequest[] = [];
  private _removeQueue: RemoveModRequest[] = [];

  // ──────────────────────────────────────────────
  // 외부 API
  // ──────────────────────────────────────────────

  /**
   * 다음 틱에 스탯 변화를 추가한다.
   * entity에 StatModsComponent가 없으면 자동 생성한다.
   */
  addMod(entityId: number, mod: StatModifier): void {
    this._addQueue.push({ entityId, mod });
  }

  /** 다음 틱에 스탯 변화를 수동 제거한다. */
  removeMod(entityId: number, sourceId: string): void {
    this._removeQueue.push({ entityId, sourceId });
  }

  // ──────────────────────────────────────────────
  // 게임 루프
  // ──────────────────────────────────────────────

  update(entities: Entity[], delta: number): void {
    const entityMap = new Map(entities.map((e) => [e.id, e]));

    // 1. 추가 요청 처리
    for (const req of this._addQueue) {
      this._processAdd(req, entityMap);
    }
    this._addQueue = [];

    // 2. 수동 제거 요청 처리
    for (const req of this._removeQueue) {
      this._processRemove(req, entityMap);
    }
    this._removeQueue = [];

    // 3. 틱: duration 감소 + 만료 처리
    for (const entity of entities) {
      const mods = entity.get(StatModsComponent);
      if (!mods) continue;
      const expired = mods._tick(delta);
      for (const { sourceId, stat } of expired) {
        this.bus.emit('stat_mod:expired', { entityId: entity.id, sourceId, stat });
      }
    }
  }

  // ──────────────────────────────────────────────
  // 내부 처리
  // ──────────────────────────────────────────────

  private _processAdd(req: AddModRequest, entityMap: Map<number, Entity>): void {
    let entity = entityMap.get(req.entityId);
    if (!entity) return;

    // StatModsComponent 없으면 자동 추가
    if (!entity.has(StatModsComponent)) {
      entity.add(new StatModsComponent());
    }

    entity.get(StatModsComponent)!.add(req.mod);

    this.bus.emit('stat_mod:added', {
      entityId: req.entityId,
      sourceId: req.mod.sourceId,
      stat: req.mod.stat,
      flat: req.mod.flat,
      percent: req.mod.percent,
      remainingDuration: req.mod.remainingDuration,
    });
  }

  private _processRemove(req: RemoveModRequest, entityMap: Map<number, Entity>): void {
    const entity = entityMap.get(req.entityId);
    const mods = entity?.get(StatModsComponent);
    if (!mods) return;

    const mod = mods.all.find((m) => m.sourceId === req.sourceId);
    const ok = mods.remove(req.sourceId);
    if (ok && mod) {
      this.bus.emit('stat_mod:removed', {
        entityId: req.entityId,
        sourceId: req.sourceId,
        stat: mod.stat,
      });
    }
  }
}
