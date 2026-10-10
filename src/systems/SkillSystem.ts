/**
 * @module systems/SkillSystem
 * 스킬 사용 요청 및 고수준 선언적 스킬 실행 파이프라인.
 *
 * 지원 기능:
 *  1. canCast: 쿨다운, MP/기력 자원, 생사 여부, 제약조건 자동 판정
 *  2. castSkill: 리소스 차감 -> 쿨다운 등록 -> 계산 파이프라인 호출 -> StatusEffect/버프 적용 -> 결과 이벤트 일괄 발행
 *  3. useSkill: 큐 기반 비동기 스킬 실행 지원 (하위 호환)
 *  4. 쿨다운 및 상태이상 지속시간 자동 틱 관리
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { SkillsComponent } from '../components/SkillsComponent';
import { StatsComponent } from '../components/StatsComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';
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

export interface CanCastResult {
  ok: boolean;
  reason?: 'no_skill' | 'cooldown' | 'no_mp' | 'dead' | 'no_target' | 'constraint' | string;
  details?: string;
}

export interface CastSkillResult {
  success: boolean;
  reason?: string;
  casterId: number;
  skillId: string;
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

  /** 외부에서 스킬 사용 요청 (큐에 등록하여 다음 update에서 실행) */
  useSkill(req: UseSkillRequest): void {
    this._pending.push(req);
  }

  onInit(): void {
    // 패시브 스킬 등 초기 설정이 필요하면 여기서 처리
  }

  /**
   * 시전자(caster)가 해당 스킬을 시전 가능한 상태인지 판정한다.
   * 쿨다운, MP/기력 자원, 생사 여부, 제약조건(스탯/장비 등)을 모두 확인한다.
   */
  canCast(caster: Entity, skillDef: SkillDef): CanCastResult {
    const skills = caster.get(SkillsComponent);
    const stats = caster.get(StatsComponent);
    const ext = caster.get(ExtendedStatsComponent);

    // 1. 스킬 습득 여부 (SkillsComponent가 있는 경우)
    if (skills && !skills.knows(skillDef.id)) {
      return { ok: false, reason: 'no_skill', details: `Entity does not know skill '${skillDef.id}'` };
    }

    // 2. 쿨다운 확인
    if (skills && !skills.isReady(skillDef.id)) {
      return { ok: false, reason: 'cooldown', details: `Skill '${skillDef.id}' is on cooldown` };
    }

    // 3. 생사 여부
    const isDead = stats?.isDead || (ext ? ext.isDead : false);
    if (isDead) {
      return { ok: false, reason: 'dead', details: 'Caster is dead' };
    }

    // 4. 자원(MP/기력) 확인
    if (skillDef.mpCost > 0) {
      if (stats && stats.mp < skillDef.mpCost) {
        return { ok: false, reason: 'no_mp', details: `Required MP: ${skillDef.mpCost}, current: ${stats.mp}` };
      }
      if (ext) {
        const currentMp = ext.getResource('mp');
        if (currentMp < skillDef.mpCost) {
          return { ok: false, reason: 'no_mp', details: `Required MP: ${skillDef.mpCost}, current: ${currentMp}` };
        }
      }
    }

    // 5. 제약조건(Constraints) 평가
    if (skillDef.constraints && skillDef.constraints.length > 0) {
      const check = this.constraintChecker.check(caster, skillDef.constraints);
      if (!check.ok) {
        return { ok: false, reason: 'constraint', details: check.reason };
      }
    }

    return { ok: true };
  }

  /**
   * 고수준 선언적 스킬 즉시 시전 파이프라인.
   * 리소스 차감 -> 쿨다운 등록 -> 계산 파이프라인 호출 -> StatusEffect/버프 적용 -> 결과 이벤트 일괄 발행.
   */
  castSkill(caster: Entity, targetEntities: Entity[], skillDef: SkillDef): CastSkillResult {
    // 1. 시전 가능 여부 검증
    const check = this.canCast(caster, skillDef);
    if (!check.ok) {
      this.bus.emit('skill:failed', {
        casterId: caster.id,
        skillId: skillDef.id,
        reason: check.reason as any,
        constraintReason: check.details,
      });
      return {
        success: false,
        reason: check.reason,
        casterId: caster.id,
        skillId: skillDef.id,
        targetIds: targetEntities.map((t) => t.id),
      };
    }

    // 2. 대상 유효성 검증
    const finalTargets = skillDef.targetType === 'self' ? [caster] : targetEntities.filter((t) => !!t);
    if (finalTargets.length === 0 && skillDef.targetType !== 'self') {
      this.bus.emit('skill:failed', {
        casterId: caster.id,
        skillId: skillDef.id,
        reason: 'no_target',
      });
      return {
        success: false,
        reason: 'no_target',
        casterId: caster.id,
        skillId: skillDef.id,
        targetIds: [],
      };
    }

    const targetIds = finalTargets.map((t) => t.id);

    // 시전 시작 이벤트 발행
    this.bus.emit('skill:cast:started', {
      casterId: caster.id,
      skillId: skillDef.id,
      targetIds,
    });

    // 3. 리소스 차감 (StatsComponent 또는 ExtendedStatsComponent)
    if (skillDef.mpCost > 0) {
      const stats = caster.get(StatsComponent);
      const ext = caster.get(ExtendedStatsComponent);
      if (stats) {
        stats.mp = Math.max(0, stats.mp - skillDef.mpCost);
      }
      if (ext && ext.hasResource('mp')) {
        ext.modifyResource('mp', -skillDef.mpCost, 'maxMp');
      }
    }

    // 4. 쿨다운 시작
    const skills = caster.get(SkillsComponent);
    skills?._startCooldown(skillDef.id);

    // 5. 효과 적용 (Damage, Heal, Buff, DoT 등)
    for (const effect of skillDef.effects) {
      for (const target of finalTargets) {
        this.executor.execute(effect, {
          caster,
          target,
          skillDef,
          bus: this.bus,
        });
      }
    }

    // 6. 결과 이벤트 일괄 발행
    this.bus.emit('skill:used', {
      casterId: caster.id,
      skillId: skillDef.id,
      targetIds,
    });

    this.bus.emit('skill:cast:completed', {
      casterId: caster.id,
      skillId: skillDef.id,
      targetIds,
      success: true,
    });

    return {
      success: true,
      casterId: caster.id,
      skillId: skillDef.id,
      targetIds,
    };
  }

  update(entities: Entity[], delta: number, mode: 'turn' | 'realtime' = 'realtime'): void {
    const entityMap = this._buildMap(entities);

    // 1. 쿨다운 & 상태이상 틱
    for (const entity of entities) {
      this._tickCooldowns(entity, delta);
      this._tickStatuses(entity, delta);
    }

    // 2. 큐에 쌓인 스킬 사용 요청 일괄 처리
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
  // 스킬 사용 처리 (내부)
  // ──────────────────────────────────────────────

  private _processUse(
    req: UseSkillRequest,
    entityMap: Map<number, Entity>,
  ): void {
    const caster = entityMap.get(req.casterId);
    if (!caster) return;

    const skills = caster.get(SkillsComponent);
    if (!skills?.knows(req.skillId)) {
      this.bus.emit('skill:failed', { casterId: req.casterId, skillId: req.skillId, reason: 'no_skill' });
      return;
    }

    const def = skills.getDef(req.skillId);
    if (!def) return;

    const targets = this._resolveTargets(def, req.targetIds, entityMap);
    this.castSkill(caster, targets, def);
  }

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
