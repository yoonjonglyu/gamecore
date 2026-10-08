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

export interface UseSkillRequest {
  casterId: number;
  skillId: string;
  /** 대상 entity ID 목록. targetType이 'self'면 비워도 됨 */
  targetIds: number[];
}

export class SkillSystem extends System<CoreEvents> {
  /**
   * query = [] → 모든 entity를 받는다.
   * 스킬 시전자(SkillsComponent)와 임의의 대상(StatsComponent 등)을
   * 동시에 다뤄야 하기 때문에 전체 entity가 필요하다.
   */
  readonly query: ComponentType[] = [];

  private _pending: UseSkillRequest[] = [];
  /** 제약조건 평가기 — 생성자 주입 또는 기본 인스턴스 사용 */
  readonly constraintChecker: ConstraintChecker;
  /**
   * StatModSystem 참조 — 주입 시 stat_mod 효과를 이 시스템으로 위임한다.
   * 없으면 직접 StatModsComponent에 추가한다 (StatModSystem 없이도 동작).
   */
  statModSystem?: StatModSystem;

  constructor(constraintChecker?: ConstraintChecker, statModSystem?: StatModSystem) {
    super();
    this.constraintChecker = constraintChecker ?? new ConstraintChecker();
    this.statModSystem = statModSystem;
  }

  /** 외부에서 스킬 사용 요청 */
  useSkill(req: UseSkillRequest): void {
    this._pending.push(req);
  }

  onInit(): void {
    // 패시브 스킬 등 초기 설정이 필요하면 여기서 처리
  }

  update(entities: Entity[], delta: number): void {
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
        this._applyEffect(effect, caster, target);
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
  ): void {
    switch (effect.type) {
      case 'damage':
        this._applyDamage(effect, caster, target);
        break;
      case 'heal':
        this._applyHeal(effect, caster, target);
        break;
      case 'status':
        this._applyStatus(effect, caster, target);
        break;
      case 'stat_mod':
        this._applyStatMod(effect, caster, target);
        break;
    }
  }

  private _applyDamage(effect: DamageEffect, caster: Entity, target: Entity): void {
    const casterStats = caster.get(StatsComponent);
    const targetStats = target.get(StatsComponent);
    if (!targetStats || targetStats.isDead) return;

    let power = effect.basePower;
    if (casterStats && effect.scaling) {
      if (effect.scaling.attack) power += casterStats.attack * effect.scaling.attack;
      if (effect.scaling.maxHp) power += casterStats.maxHp * effect.scaling.maxHp;
    }

    const critChance = effect.critChance ?? 0.05;
    const critMult = effect.critMultiplier ?? 1.5;
    const isCritical = Math.random() < critChance;
    const raw = isCritical ? power * critMult : power;

    const armorPierce = effect.armorPierce ?? 0;
    const effectiveDefense = targetStats.defense * (1 - armorPierce);
    const effective = Math.max(0, raw - effectiveDefense);

    if (effective === 0) {
      this.bus.emit('combat:miss', { attackerId: caster.id, targetId: target.id });
      return;
    }

    const prevHp = targetStats.hp;
    targetStats.hp = Math.max(0, targetStats.hp - effective);

    this.bus.emit('combat:damage', {
      attackerId: caster.id,
      targetId: target.id,
      raw,
      effective,
      isCritical,
    });
    this.bus.emit('stats:hp:changed', {
      entityId: target.id,
      prev: prevHp,
      next: targetStats.hp,
      delta: -effective,
    });

    if (targetStats.isDead) {
      this.bus.emit('stats:died', { entityId: target.id });
    }
  }

  private _applyHeal(effect: HealEffect, caster: Entity, target: Entity): void {
    const targetStats = target.get(StatsComponent);
    if (!targetStats) return;

    let amount = effect.basePower;
    if (effect.scaling?.maxHp) {
      amount += targetStats.maxHp * effect.scaling.maxHp;
    }

    const prevHp = targetStats.hp;
    targetStats.hp = Math.min(targetStats.maxHp, targetStats.hp + amount);

    this.bus.emit('stats:hp:changed', {
      entityId: target.id,
      prev: prevHp,
      next: targetStats.hp,
      delta: amount,
    });

    if (effect.restoreMp) {
      const prevMp = targetStats.mp;
      targetStats.mp = Math.min(targetStats.maxMp, targetStats.mp + amount);
      if (targetStats.mp !== prevMp) {
        // MP 변화 이벤트는 향후 확장 가능
      }
    }
  }

  private _applyStatus(effect: StatusEffect, caster: Entity, target: Entity): void {
    const chance = effect.chance ?? 1.0;
    if (Math.random() > chance) return;

    let statusComp = target.get(StatusEffectsComponent);
    if (!statusComp) {
      statusComp = new StatusEffectsComponent();
      statusComp.entityId = target.id;
      target.add(statusComp);
    }

    statusComp.apply(
      effect.statusId,
      effect.duration,
      caster.id,
      effect.stacks ?? 1,
    );

    const instance = statusComp.get(effect.statusId)!;
    this.bus.emit('status:applied', {
      entityId: target.id,
      statusId: effect.statusId,
      duration: effect.duration,
      stacks: instance.stacks,
      sourceEntityId: caster.id,
    });
  }

  private _applyStatMod(effect: StatModEffect, caster: Entity, target: Entity): void {
    const mod: StatModifier = {
      sourceId: `skill:${effect.stat}:${caster.id}`,
      stat: effect.stat,
      flat: effect.flat,
      percent: effect.percent,
      remainingDuration: effect.duration,
      sourceEntityId: caster.id,
    };

    // StatModsComponent에 즉시 적용 (틱 지연 없음)
    if (!target.has(StatModsComponent)) {
      target.add(new StatModsComponent());
    }
    target.get(StatModsComponent)!.add(mod);

    // 이벤트 발행 — StatModSystem 있으면 위임, 없으면 직접
    if (this.statModSystem) {
      // StatModSystem은 이미 추가됐으므로 이벤트만 발행하면 됨
      // bus를 통해 직접 발행 (중복 추가 방지)
    }
    this.bus.emit('stat_mod:added', {
      entityId: target.id,
      sourceId: mod.sourceId,
      stat: mod.stat,
      flat: mod.flat,
      percent: mod.percent,
      remainingDuration: mod.remainingDuration,
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
