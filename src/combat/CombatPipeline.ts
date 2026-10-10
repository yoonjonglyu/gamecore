/**
 * @module combat/CombatPipeline
 * 전략형 플러거블 전투 파이프라인.
 *
 * 4단계 라이프사이클 훅 (Middleware) & 전략 패턴 데미지 계산기 (DamageCalculator).
 *
 * 1) onPreHit: 명중/회피, 크리티컬 확률 및 배율 주입
 * 2) onDamageCalculate: 물리/마법/고정 피해, 방어력/마법저항, 방어관통(Armor Pen) 반영
 * 3) onShieldAbsorb: BarrierComponent가 존재할 경우 HP 차감 전 쉴드 소모
 * 4) onPostHit: 흡혈, 추가타, 반사, 상태이상 부여
 */

import { Entity } from '../core/Entity';
import { StatsComponent } from '../components/StatsComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';
import { BarrierComponent } from '../components/BarrierComponent';
import { SeededRandom } from '../math/SeededRandom';
import { CombatRoundingConfig, DEFAULT_ROUNDING_CONFIG, applyRounding } from '../math/RoundingPolicy';

export type DamageType = 'physical' | 'magical' | 'true' | string;

export interface AttackRequest {
  attackerId: number;
  targetId: number;
  /** 기본 공격력 오버라이드 (없으면 attacker의 스탯 참조) */
  baseDamage?: number;
  /** 데미지 속성 (기본: 'physical') */
  damageType?: DamageType;
  /** 방어 관통률 (0~1, 예: 0.3 = 30% 방어력 무시) */
  armorPen?: number;
  /** 마법 관통률 (0~1) */
  magicPen?: number;
  /** 크리티컬 확률 0~1 (기본 0.05) */
  critChance?: number;
  /** 크리티컬 배율 (기본 1.5) */
  critMultiplier?: number;
  /** 명중률 0~1 (기본 1.0) */
  hitChance?: number;
  /** 회피율 0~1 (기본 0.0) */
  evasionChance?: number;
  /** 흡혈 비율 0~1 (예: 0.2 = 피해량의 20% 흡혈) */
  lifesteal?: number;
  /** 피해 반사 비율 0~1 */
  reflected?: number;
  /** 대미지/스탯 라운딩 정책 */
  rounding?: CombatRoundingConfig;
  /** 임의의 커스텀 추가 데이터 */
  custom?: Record<string, any>;
}

export interface CombatContext {
  attacker: Entity;
  target: Entity;
  request: AttackRequest;

  /** 결정론적 난수 생성기 (선택) */
  random?: SeededRandom;
  /** 대미지/수치 라운딩 정책 */
  rounding?: CombatRoundingConfig;

  // ── Step 1: Pre-Hit ───────────────────────────
  hitChance: number;
  evasionChance: number;
  isMiss: boolean;
  isEvaded: boolean;
  critChance: number;
  critMultiplier: number;
  isCritical: boolean;

  // ── Step 2: Damage Calculate ───────────────────
  damageType: DamageType;
  baseDamage: number;
  rawDamage: number;
  targetDefense: number;
  armorPen: number;
  magicPen: number;
  calculatedDamage: number;

  // ── Step 3: Shield Absorb ─────────────────────
  barrierAbsorbed: number;
  damageAfterBarrier: number;
  barrierBroken: boolean;

  // ── Step 4: Post-Hit ──────────────────────────
  effectiveHpDamage: number;
  prevTargetHp: number;
  nextTargetHp: number;
  isTargetDead: boolean;
  lifestealRatio: number;
  lifestealAmount: number;
  reflectedRatio: number;
  reflectedDamage: number;
  extraHits: number;

  // ── Flow Control ──────────────────────────────
  cancelled: boolean;
  cancelReason?: string;
}

/**
 * 데미지 계산 전략 인터페이스 (Strategy Pattern)
 */
export interface DamageCalculator {
  calculate(ctx: CombatContext): number;
}

/**
 * 기본 데미지 계산 전략:
 * - true 데미지: 방어력 무시 (rawDamage 그대로)
 * - physical / 기타: targetDefense * (1 - armorPen) 차감
 * - 설정된 라운딩 정책(CombatRoundingConfig) 적용
 */
export class DefaultDamageCalculator implements DamageCalculator {
  readonly rounding?: CombatRoundingConfig;

  constructor(rounding?: CombatRoundingConfig) {
    this.rounding = rounding;
  }

  calculate(ctx: CombatContext): number {
    const config = ctx.rounding ?? this.rounding ?? DEFAULT_ROUNDING_CONFIG;
    let result = 0;

    if (ctx.damageType === 'true') {
      result = Math.max(0, ctx.rawDamage);
    } else {
      const effectiveDefense = Math.max(0, ctx.targetDefense * (1 - ctx.armorPen));
      result = Math.max(0, ctx.rawDamage - effectiveDefense);
    }

    return applyRounding(result, config);
  }
}

/**
 * 전투 단계별 라이프사이클 훅 미들웨어
 */
export interface CombatMiddleware {
  name?: string;
  onPreHit?(ctx: CombatContext): void;
  onDamageCalculate?(ctx: CombatContext): void;
  onShieldAbsorb?(ctx: CombatContext): void;
  onPostHit?(ctx: CombatContext): void;
}

/**
 * 기본 PreHit 미들웨어 (명중/회피, 크리티컬 계산)
 * - SeededRandom 주입 시 결정론적 난수 사용
 * - CombatRoundingConfig 주입 시 rawDamage에 라운딩 적용
 */
export class DefaultPreHitMiddleware implements CombatMiddleware {
  name = 'DefaultPreHit';
  readonly random?: SeededRandom;
  readonly rounding?: CombatRoundingConfig;

  constructor(options?: { random?: SeededRandom; rounding?: CombatRoundingConfig }) {
    this.random = options?.random;
    this.rounding = options?.rounding;
  }

  onPreHit(ctx: CombatContext): void {
    const rng = ctx.random ?? this.random;
    const roll = (prob: number) => (rng ? rng.chance(prob) : Math.random() < prob);

    // 회피 판정
    if (ctx.evasionChance > 0 && roll(ctx.evasionChance)) {
      ctx.isEvaded = true;
      ctx.isMiss = true;
      return;
    }

    // 명중 판정
    if (ctx.hitChance < 1.0 && !roll(ctx.hitChance)) {
      ctx.isMiss = true;
      return;
    }

    // 크리티컬 판정
    ctx.isCritical = roll(ctx.critChance);
    const unroundedRaw = ctx.isCritical ? ctx.baseDamage * ctx.critMultiplier : ctx.baseDamage;
    const roundingConfig = ctx.rounding ?? this.rounding;
    ctx.rawDamage = applyRounding(unroundedRaw, roundingConfig);
  }
}

/**
 * 기본 쉴드 흡수 미들웨어 (BarrierComponent 연동)
 */
export class DefaultShieldAbsorbMiddleware implements CombatMiddleware {
  name = 'DefaultShieldAbsorb';

  onShieldAbsorb(ctx: CombatContext): void {
    const barrier = ctx.target.get(BarrierComponent);
    if (!barrier || barrier.isDepleted || ctx.calculatedDamage <= 0) {
      ctx.damageAfterBarrier = ctx.calculatedDamage;
      return;
    }

    const result = barrier.absorb(ctx.calculatedDamage);
    ctx.barrierAbsorbed = result.absorbed;
    ctx.damageAfterBarrier = result.remainingDamage;
    ctx.barrierBroken = result.broken;
  }
}

/**
 * 기본 PostHit 미들웨어 (흡혈, 반사 데미지 적용)
 */
export class DefaultPostHitMiddleware implements CombatMiddleware {
  name = 'DefaultPostHit';

  onPostHit(ctx: CombatContext): void {
    // 흡혈 처리
    if (ctx.lifestealRatio > 0 && ctx.effectiveHpDamage > 0) {
      ctx.lifestealAmount = Math.round(ctx.effectiveHpDamage * ctx.lifestealRatio);
      if (ctx.lifestealAmount > 0) {
        const attackerStats = ctx.attacker.get(StatsComponent);
        const attackerExt = ctx.attacker.get(ExtendedStatsComponent);
        if (attackerStats) {
          attackerStats.hp = Math.min(attackerStats.maxHp, attackerStats.hp + ctx.lifestealAmount);
        } else if (attackerExt) {
          attackerExt.modifyResource('hp', ctx.lifestealAmount, 'maxHp');
        }
      }
    }

    // 반사 피해 처리
    if (ctx.reflectedRatio > 0 && ctx.effectiveHpDamage > 0) {
      ctx.reflectedDamage = Math.round(ctx.effectiveHpDamage * ctx.reflectedRatio);
      if (ctx.reflectedDamage > 0) {
        const attackerStats = ctx.attacker.get(StatsComponent);
        const attackerExt = ctx.attacker.get(ExtendedStatsComponent);
        if (attackerStats) {
          attackerStats.hp = Math.max(0, attackerStats.hp - ctx.reflectedDamage);
        } else if (attackerExt) {
          attackerExt.modifyResource('hp', -ctx.reflectedDamage, 'maxHp');
        }
      }
    }
  }
}
