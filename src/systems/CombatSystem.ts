/**
 * @module systems/CombatSystem
 * 전략형 플러거블 전투 파이프라인 시스템.
 *
 * 단일 감산 공식을 탈피하고 전략 패턴(DamageCalculator)과
 * 4단계 라이프사이클 미들웨어(onPreHit, onDamageCalculate, onShieldAbsorb, onPostHit)를 적용.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { StatsComponent } from '../components/StatsComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';
import { CoreEvents } from '../events';
import {
  AttackRequest,
  CombatContext,
  DamageCalculator,
  CombatMiddleware,
  DefaultDamageCalculator,
  DefaultPreHitMiddleware,
  DefaultShieldAbsorbMiddleware,
  DefaultPostHitMiddleware,
} from '../combat/CombatPipeline';

export type { AttackRequest } from '../combat/CombatPipeline';

export interface CombatSystemOptions {
  calculator?: DamageCalculator;
  middlewares?: CombatMiddleware[];
}

export class CombatSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [];

  private _pendingAttacks: AttackRequest[] = [];
  private _calculator: DamageCalculator;
  private _middlewares: CombatMiddleware[] = [];

  constructor(options: CombatSystemOptions = {}) {
    super();
    this._calculator = options.calculator ?? new DefaultDamageCalculator();

    if (options.middlewares) {
      this._middlewares = [...options.middlewares];
    } else {
      // 기본 미들웨어 세팅
      this._middlewares = [
        new DefaultPreHitMiddleware(),
        new DefaultShieldAbsorbMiddleware(),
        new DefaultPostHitMiddleware(),
      ];
    }
  }

  /** 데미지 계산 전략 교체 */
  setCalculator(calculator: DamageCalculator): this {
    this._calculator = calculator;
    return this;
  }

  get calculator(): DamageCalculator {
    return this._calculator;
  }

  /** 전투 미들웨어 추가 */
  use(middleware: CombatMiddleware): this {
    this._middlewares.push(middleware);
    return this;
  }

  /** 외부(게임 로직, UI 등)에서 공격 요청을 큐에 넣는다 */
  requestAttack(req: AttackRequest): void {
    this._pendingAttacks.push(req);
  }

  update(entities: Entity[], _delta: number): void {
    if (this._pendingAttacks.length === 0) return;

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    for (const req of this._pendingAttacks) {
      this._processAttack(req, entityMap);
    }
    this._pendingAttacks = [];
  }

  private _processAttack(
    req: AttackRequest,
    entityMap: Map<number, Entity>,
  ): void {
    const attacker = entityMap.get(req.attackerId);
    const target = entityMap.get(req.targetId);
    if (!attacker || !target) return;

    // 공격자 및 대상 스탯 확인 (StatsComponent 또는 ExtendedStatsComponent)
    const attackerStats = attacker.get(StatsComponent);
    const attackerExt = attacker.get(ExtendedStatsComponent);
    const targetStats = target.get(StatsComponent);
    const targetExt = target.get(ExtendedStatsComponent);

    // 대상이 없거나 사망 상태면 중단
    const isTargetDead = targetStats?.isDead || (targetExt ? targetExt.isDead : false);
    if ((!targetStats && !targetExt) || isTargetDead) return;

    // 기본 공격력 / 방어력 추출
    const baseAtk = req.baseDamage ??
      (attackerStats ? attackerStats.attack : (attackerExt ? attackerExt.get('attack') : 10));
    const baseDef = targetStats ? targetStats.defense : (targetExt ? targetExt.get('defense') : 0);
    const currentHp = targetStats ? targetStats.hp : (targetExt ? targetExt.hp : 100);

    // ── CombatContext 초기화 ────────────────────────
    const ctx: CombatContext = {
      attacker,
      target,
      request: req,

      // Step 1: Pre-Hit
      hitChance: req.hitChance ?? 1.0,
      evasionChance: req.evasionChance ?? 0.0,
      isMiss: false,
      isEvaded: false,
      critChance: req.critChance ?? 0.05,
      critMultiplier: req.critMultiplier ?? 1.5,
      isCritical: false,

      // Step 2: Damage Calculate
      damageType: req.damageType ?? 'physical',
      baseDamage: baseAtk,
      rawDamage: baseAtk,
      targetDefense: baseDef,
      armorPen: req.armorPen ?? 0,
      magicPen: req.magicPen ?? 0,
      calculatedDamage: 0,

      // Step 3: Shield Absorb
      barrierAbsorbed: 0,
      damageAfterBarrier: 0,
      barrierBroken: false,

      // Step 4: Post-Hit
      effectiveHpDamage: 0,
      prevTargetHp: currentHp,
      nextTargetHp: currentHp,
      isTargetDead: false,
      lifestealRatio: req.lifesteal ?? 0,
      lifestealAmount: 0,
      reflectedRatio: req.reflected ?? 0,
      reflectedDamage: 0,
      extraHits: 0,

      cancelled: false,
    };

    // ── 1. onPreHit 미들웨어 실행 ────────────────────
    for (const mw of this._middlewares) {
      mw.onPreHit?.(ctx);
      if (ctx.cancelled) return;
    }

    // 미스 또는 회피 시 처리
    if (ctx.isMiss || ctx.isEvaded) {
      this.bus.emit('combat:miss', {
        attackerId: req.attackerId,
        targetId: req.targetId,
        reason: ctx.isEvaded ? 'evaded' : 'accuracy',
      });
      return;
    }

    // ── 2. onDamageCalculate 미들웨어 및 계산기 실행 ──
    for (const mw of this._middlewares) {
      mw.onDamageCalculate?.(ctx);
      if (ctx.cancelled) return;
    }

    ctx.calculatedDamage = this._calculator.calculate(ctx);

    if (ctx.calculatedDamage <= 0) {
      this.bus.emit('combat:miss', {
        attackerId: req.attackerId,
        targetId: req.targetId,
        reason: 'no_damage',
      });
      return;
    }

    // ── 3. onShieldAbsorb 미들웨어 실행 ──────────────
    ctx.damageAfterBarrier = ctx.calculatedDamage;
    for (const mw of this._middlewares) {
      mw.onShieldAbsorb?.(ctx);
      if (ctx.cancelled) return;
    }

    if (ctx.barrierAbsorbed > 0) {
      this.bus.emit('barrier:absorbed', {
        entityId: target.id,
        amount: ctx.barrierAbsorbed,
        remainingBarrier: target.get(ExtendedStatsComponent) ? 0 : 0, // barrier component current value
      });
    }

    if (ctx.barrierBroken) {
      this.bus.emit('barrier:broken', { entityId: target.id });
    }

    // ── 4. HP 차감 & onPostHit 미들웨어 실행 ──────────
    ctx.effectiveHpDamage = Math.min(ctx.prevTargetHp, ctx.damageAfterBarrier);

    if (targetStats) {
      targetStats.hp = Math.max(0, targetStats.hp - ctx.damageAfterBarrier);
      ctx.nextTargetHp = targetStats.hp;
      ctx.isTargetDead = targetStats.isDead;
    } else if (targetExt) {
      const res = targetExt.modifyResource('hp', -ctx.damageAfterBarrier, 'maxHp');
      ctx.nextTargetHp = res.next;
      ctx.isTargetDead = targetExt.isDead;
    }

    for (const mw of this._middlewares) {
      mw.onPostHit?.(ctx);
    }

    // 이벤트 발행
    this.bus.emit('combat:damage', {
      attackerId: req.attackerId,
      targetId: req.targetId,
      raw: ctx.rawDamage,
      effective: ctx.calculatedDamage,
      isCritical: ctx.isCritical,
      damageType: ctx.damageType,
      shieldAbsorbed: ctx.barrierAbsorbed,
    });

    if (ctx.effectiveHpDamage > 0) {
      this.bus.emit('stats:hp:changed', {
        entityId: req.targetId,
        prev: ctx.prevTargetHp,
        next: ctx.nextTargetHp,
        delta: -ctx.effectiveHpDamage,
      });
    }

    if (ctx.lifestealAmount > 0) {
      this.bus.emit('combat:lifesteal', {
        attackerId: req.attackerId,
        targetId: req.targetId,
        amount: ctx.lifestealAmount,
      });
    }

    if (ctx.reflectedDamage > 0) {
      this.bus.emit('combat:reflected', {
        attackerId: req.attackerId,
        targetId: req.targetId,
        amount: ctx.reflectedDamage,
      });
    }

    if (ctx.isTargetDead) {
      this.bus.emit('stats:died', { entityId: req.targetId });
    }
  }
}
