/**
 * @module systems/SkillSystem
 * 스킬 사용 요청을 처리한다.
 *
 * 처리 순서 (매 update):
 *  1. 쿨다운 틱 (시간 감소, ready 이벤트 발행)
 *  2. 상태이상 틱 (duration 감소, 만료 이벤트 발행)
 *  3. 큐에 쌓인 스킬 사용 요청 처리
 *     a. 검증 (스킬 보유, 쿨다운, MP, 생사 확인)
 *     b. MP 소비
 *     c. 쿨다운 시작
 *     d. 효과 적용 (DamageEffect → CombatSystem 연계 or 직접 처리)
 *     e. skill:used 이벤트 발행
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { SkillsComponent } from '../components/SkillsComponent';
import { StatsComponent } from '../components/StatsComponent';
import { StatusEffectsComponent } from '../components/StatusEffectsComponent';
import { ConstraintChecker } from '../constraints/ConstraintChecker';
import { StatModsComponent, StatModifier } from '../components/StatModsComponent';
import { StatModSystem } from './StatModSystem';
import {
  SkillDef,
  SkillEffectDef,
  DamageEffect,
  HealEffect,
  StatusEffect,
  StatModEffect,
} from '../skills/SkillDef';

import { SkillEffectExecutor, SkillEffectHandler } from '../skills/SkillEffectExecutor';

export interface UseSkillRequest {
  casterId: number;
  skillId: string;
  /** 대상 entity ID 목록. targetType이 'self'면 비워도 됨 */
  targetIds: number[];
}

export class SkillSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [];

  private _pending: UseSkillRequest[] = [];
  /** 제약조건 평가기 — 생성자 주입 또는 기본 인스턴스 사용 */
  readonly constraintChecker: ConstraintChecker;
  readonly executor: SkillEffectExecutor;
  /**
   * StatModSystem 참조 — 주입 시 stat_mod 효과를 이 시스템으로 위임한다.
   */
  statModSystem?: StatModSystem;

  constructor(
    constraintChecker?: ConstraintChecker,
    statModSystem?: StatModSystem,
    executor?: SkillEffectExecutor,
  ) {
    super();
    this.constraintChecker = constraintChecker ?? new ConstraintChecker();
    this.statModSystem = statModSystem;
    this.executor = executor ?? new SkillEffectExecutor();
  }

  /** 커스텀 스킬 효과 등록 */
  registerEffect<T extends SkillEffectDef>(type: string, handler: SkillEffectHandler<T>): this {
    this.executor.register(type, handler);
    return this;
  }

  /** 외부에서 스킬 사용 요청 */
  useSkill(req: UseSkillRequest): void {
    this._pending.push(req);
  }

  onInit(): void {
    // 패시브 스킬 등 초기 설정이 필요하면 여기서 처리
  }

  update(entities: Entity[], delta: number, mode: 'turn' | 'realtime' = 'realtime'): void {
    const entityMap = this._buildMap(entities);

    // 1. 쿨다운 & 상태이상 틱
    for (const entity of entities) {
      this._tickCooldowns(entity, delta);
      this._tickStatuses(entity, delta);
    }

    // 2. 스킬 사용 요청 처리
    for (const req of this._pending) {
      this._processUse(req, entityMap);
    }
    this._pending = [];
  }


  // ──────────────────────────────────────────────
  // 틱
  // ──────────────────────────────────────────────

  private _tickCooldowns(entity: Entity, delta: number): void {
    const skills = entity.get(SkillsComponent);
    if (!skills) return;

    const readyNow = skills._tickCooldowns(delta);
    for (const skillId of readyNow) {
      this.bus.emit('skill:cooldown:ready', { entityId: entity.id, skillId });
    }
  }

  private _tickStatuses(entity: Entity, delta: number): void {
    const statuses = entity.get(StatusEffectsComponent);
    if (!statuses) return;

    const expired = statuses._tick(delta);
    for (const statusId of expired) {
      this.bus.emit('status:expired', { entityId: entity.id, statusId });
    }
  }

  // ──────────────────────────────────────────────
  // 스킬 사용 처리
  // ──────────────────────────────────────────────

  private _processUse(
    req: UseSkillRequest,
    entityMap: Map<number, Entity>,
  ): void {
    const caster = entityMap.get(req.casterId);
    if (!caster) return;

    const skills = caster.get(SkillsComponent);
    const casterStats = caster.get(StatsComponent);

    // ── 검증 ──────────────────────────────────

    if (!skills?.knows(req.skillId)) {
      this.bus.emit('skill:failed', { casterId: req.casterId, skillId: req.skillId, reason: 'no_skill' });
      return;
    }

    if (!skills.isReady(req.skillId)) {
      this.bus.emit('skill:failed', { casterId: req.casterId, skillId: req.skillId, reason: 'cooldown' });
      return;
    }

    const def = skills.getDef(req.skillId)!;

    if (casterStats?.isDead) {
      this.bus.emit('skill:failed', { casterId: req.casterId, skillId: req.skillId, reason: 'dead' });
      return;
    }

    if (casterStats && casterStats.mp < def.mpCost) {
      this.bus.emit('skill:failed', { casterId: req.casterId, skillId: req.skillId, reason: 'no_mp' });
      return;
    }

    // ── 제약조건 평가 ──────────────────────────

    if (def.constraints && def.constraints.length > 0) {
      const result = this.constraintChecker.check(caster, def.constraints);
      if (!result.ok) {
        this.bus.emit('skill:failed', {
          casterId: req.casterId,
          skillId: req.skillId,
          reason: 'constraint',
          constraintReason: result.reason,
        });
        return;
      }
    }

    // ── 실제 대상 결정 ────────────────────────

    const targets = this._resolveTargets(def, req.targetIds, entityMap);
    if (targets.length === 0 && def.targetType !== 'self') {
      this.bus.emit('skill:failed', { casterId: req.casterId, skillId: req.skillId, reason: 'no_target' });
      return;
    }
    const finalTargets = def.targetType === 'self' ? [caster] : targets;

    // ── MP 소비 + 쿨다운 시작 ─────────────────

    if (casterStats) casterStats.mp = Math.max(0, casterStats.mp - def.mpCost);
    skills._startCooldown(req.skillId);

    // ── 효과 적용 ─────────────────────────────

    for (const effect of def.effects) {
      for (const target of finalTargets) {
        this.executor.execute(effect, {
          caster,
          target,
          skillDef: def,
          bus: this.bus,
        });
      }
    }

    this.bus.emit('skill:used', {
      casterId: req.casterId,
      skillId: req.skillId,
      targetIds: finalTargets.map((t) => t.id),
    });
  }

  // ──────────────────────────────────────────────
  // 효과 적용
  // ──────────────────────────────────────────────

  private _applyEffect(
    effect: SkillEffectDef,
    caster: Entity,
    target: Entity,
    def?: SkillDef,
  ): void {
    this.executor.execute(effect, {
      caster,
      target,
      skillDef: def ?? {
        id: 'unknown',
        name: 'unknown',
        mpCost: 0,
        cooldown: 0,
        targetType: 'single_enemy',
        effects: [effect],
      },
      bus: this.bus,
    });
  }


  // ──────────────────────────────────────────────
  // 유틸
  // ──────────────────────────────────────────────

  private _resolveTargets(
    def: SkillDef,
    requestedIds: number[],
    entityMap: Map<number, Entity>,
  ): Entity[] {
    return requestedIds
      .map((id) => entityMap.get(id))
      .filter((e): e is Entity => !!e);
  }

  private _buildMap(entities: Entity[]): Map<number, Entity> {
    return new Map(entities.map((e) => [e.id, e]));
  }
}
