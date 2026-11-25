/**
 * @module skills/SkillEffectExecutor
 * 선언적 스킬 효과 디스패처 (SkillEffectExecutor).
 *
 * SkillDef.effects 배열을 순회하여 대상에게 데미지, 회복, 상태이상, 버프를 디스패치한다.
 * 커스텀 효과(type: 'shield', 'teleport', 'summon' 등)를 register 메서드로 무한히 확장 가능.
 */

import { Entity } from '../core/Entity';
import { EventBus } from '../core/EventBus';
import { CoreEvents } from '../events';
import { StatsComponent } from '../components/StatsComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';
import { BarrierComponent } from '../components/BarrierComponent';
import { StatusEffectsComponent } from '../components/StatusEffectsComponent';
import { StatModsComponent, StatModifier } from '../components/StatModsComponent';
import { SeededRandom } from '../math/SeededRandom';
import type { StatusEffectSystem } from '../systems/StatusEffectSystem';
import {
  SkillDef,
  SkillEffectDef,
  DamageEffect,
  HealEffect,
  StatusEffect,
  StatModEffect,
} from './SkillDef';

export interface SkillEffectContext {
  caster: Entity;
  target: Entity;
  skillDef: SkillDef;
  bus: EventBus<CoreEvents>;
  random?: SeededRandom;
  statusEffectSystem?: StatusEffectSystem;
}

export type SkillEffectHandler<T extends SkillEffectDef = any> = (
  effect: T,
  ctx: SkillEffectContext,
) => void;

export class SkillEffectExecutor {
  private _handlers: Map<string, SkillEffectHandler> = new Map();

  constructor() {
    this._registerDefaultHandlers();
  }

  /**
   * 커스텀 스킬 효과 핸들러 등록
   */
  register<T extends SkillEffectDef>(type: string, handler: SkillEffectHandler<T>): this {
    this._handlers.set(type, handler as SkillEffectHandler);
    return this;
  }

  hasHandler(type: string): boolean {
    return this._handlers.has(type);
  }

  /**
   * 단일 효과 실행
   */
  execute(effect: SkillEffectDef, ctx: SkillEffectContext): void {
    const handler = this._handlers.get(effect.type);
    if (handler) {
      handler(effect, ctx);
    }
  }

  /**
   * 기본 제공 효과 핸들러 등록 (damage, heal, status, stat_mod)
   */
  private _registerDefaultHandlers(): void {
    // ── 데미지 효과 ───────────────────────────
    this.register<DamageEffect>('damage', (effect, ctx) => {
      const { caster, target, bus, random } = ctx;
      const casterStats = caster.get(StatsComponent);
      const casterExt = caster.get(ExtendedStatsComponent);
      const casterMods = caster.get(StatModsComponent);
      const targetStats = target.get(StatsComponent);
      const targetExt = target.get(ExtendedStatsComponent);
      const targetMods = target.get(StatModsComponent);

      const isTargetDead = targetStats?.isDead || targetExt?.isDead;
      if (isTargetDead) return;

      const atk = casterStats ? casterStats.computedAttack(casterMods) : (casterExt ? casterExt.get('attack') : 10);
      const maxHp = casterStats ? casterStats.computedMaxHp(casterMods) : (casterExt ? casterExt.get('maxHp') : 100);
      const targetDef = targetStats ? targetStats.computedDefense(targetMods) : (targetExt ? targetExt.get('defense') : 0);

      let power = effect.basePower ?? (effect as any).baseDamage ?? 0;
      if (effect.scaling) {
        if (effect.scaling.attack) power += atk * effect.scaling.attack;
        if (effect.scaling.maxHp) power += maxHp * effect.scaling.maxHp;
      }

      const critChance = effect.critChance ?? 0.05;
      const critMult = effect.critMultiplier ?? 1.5;
      const isCritical = random ? random.chance(critChance) : (critChance > 0 && Math.random() < critChance);
      const raw = isCritical ? power * critMult : power;

      const armorPierce = effect.armorPierce ?? 0;
      const effectiveDefense = targetDef * (1 - armorPierce);
      const calculated = Math.max(0, raw - effectiveDefense);

      if (calculated === 0) {
        bus.emit('combat:miss', { attackerId: caster.id, targetId: target.id });
        return;
      }

      // 배리어/실드 흡수 반영
      let damageAfterBarrier = calculated;
      let barrierAbsorbed = 0;
      const barrier = target.get(BarrierComponent);
      if (barrier && !barrier.isDepleted) {
        const absorbRes = barrier.absorb(calculated);
        barrierAbsorbed = absorbRes.absorbed;
        damageAfterBarrier = absorbRes.remainingDamage;

        if (barrierAbsorbed > 0) {
          bus.emit('barrier:absorbed', {
            entityId: target.id,
            amount: barrierAbsorbed,
            remainingBarrier: barrier.current,
          });
        }
        if (absorbRes.broken) {
          bus.emit('barrier:broken', { entityId: target.id });
        }
      }

      let prevHp = 0;
      let nextHp = 0;

      if (targetStats) {
        prevHp = targetStats.hp;
        targetStats.hp = Math.max(0, targetStats.hp - damageAfterBarrier);
        nextHp = targetStats.hp;
      } else if (targetExt) {
        prevHp = targetExt.hp;
        const res = targetExt.modifyResource('hp', -damageAfterBarrier, 'maxHp');
        nextHp = res.next;
      }

      bus.emit('combat:damage', {
        attackerId: caster.id,
        targetId: target.id,
        raw,
        effective: calculated,
        isCritical,
        shieldAbsorbed: barrierAbsorbed,
      });

      const actualDelta = nextHp - prevHp;
      if (actualDelta !== 0) {
        bus.emit('stats:hp:changed', {
          entityId: target.id,
          prev: prevHp,
          next: nextHp,
          delta: actualDelta,
        });
      }

      if (nextHp <= 0 && prevHp > 0) {
        bus.emit('stats:died', { entityId: target.id, killerId: caster.id });
      }
    });

    // ── 치유 효과 ─────────────────────────────
    this.register<HealEffect>('heal', (effect, ctx) => {
      const { target, bus } = ctx;
      const targetStats = target.get(StatsComponent);
      const targetExt = target.get(ExtendedStatsComponent);
      const targetMods = target.get(StatModsComponent);
      if (!targetStats && !targetExt) return;

      // 사망한 대상은 일반 치유로 부활 불가
      if (targetStats?.isDead || targetExt?.isDead) return;

      const maxHp = targetStats ? targetStats.computedMaxHp(targetMods) : targetExt!.maxHp;
      let amount = effect.basePower;
      if (effect.scaling?.maxHp) {
        amount += maxHp * effect.scaling.maxHp;
      }

      let prevHp = 0;
      let nextHp = 0;

      if (targetStats) {
        prevHp = targetStats.hp;
        const maxCap = targetStats.maxHp;
        targetStats.hp = Math.min(maxCap, targetStats.hp + amount);
        nextHp = targetStats.hp;
      } else if (targetExt) {
        prevHp = targetExt.hp;
        const res = targetExt.modifyResource('hp', amount, 'maxHp');
        nextHp = res.next;
      }

      const actualDelta = nextHp - prevHp;
      if (actualDelta !== 0) {
        bus.emit('stats:hp:changed', {
          entityId: target.id,
          prev: prevHp,
          next: nextHp,
          delta: actualDelta,
        });
      }

      if (effect.restoreMp) {
        if (targetStats) {
          targetStats.mp = Math.min(targetStats.maxMp, targetStats.mp + amount);
        } else if (targetExt) {
          targetExt.modifyResource('mp', amount, 'maxMp');
        }
      }
    });

    // ── 상태이상 효과 ──────────────────────────
    this.register<StatusEffect>('status', (effect, ctx) => {
      const { caster, target, bus, random, statusEffectSystem } = ctx;
      const chance = effect.chance ?? 1.0;
      const success = random ? random.chance(chance) : (chance > 0 && Math.random() < chance);
      if (!success) return;

      const sys = statusEffectSystem;
      if (sys) {
        sys.applyStatus(
          target,
          effect.statusId,
          effect.duration,
          caster.id,
          effect.stacks ?? 1,
          effect.stacks ?? 1,
        );
        return;
      }

      let statusComp = target.get(StatusEffectsComponent);
      if (!statusComp) {
        statusComp = new StatusEffectsComponent();
        target.add(statusComp);
      }

      statusComp.apply(
        effect.statusId,
        effect.duration,
        caster.id,
        effect.stacks ?? 1,
      );

      const instance = statusComp.get(effect.statusId)!;
      bus.emit('status:applied', {
        entityId: target.id,
        statusId: effect.statusId,
        duration: effect.duration,
        stacks: instance.stacks,
        sourceEntityId: caster.id,
      });
    });

    // ── 스탯 변화 효과 (버프/디버프) ─────────────
    this.register<StatModEffect>('stat_mod', (effect, ctx) => {
      const { caster, target, bus, skillDef } = ctx;
      const sourceId = `skill:${skillDef.id}:${effect.stat}:${caster.id}`;
      const mod: StatModifier = {
        sourceId,
        stat: effect.stat,
        flat: effect.flat,
        percent: effect.percent,
        remainingDuration: effect.duration,
        sourceEntityId: caster.id,
      };

      const targetExt = target.get(ExtendedStatsComponent);
      if (targetExt && !target.has(StatsComponent)) {
        targetExt.addModifier(mod);
      } else {
        if (!target.has(StatModsComponent)) {
          target.add(new StatModsComponent());
        }
        target.get(StatModsComponent)!.add(mod);
        if (targetExt) {
          targetExt.addModifier(mod);
        }
      }

      bus.emit('stat_mod:added', {
        entityId: target.id,
        sourceId: mod.sourceId,
        stat: mod.stat,
        flat: mod.flat,
        percent: mod.percent,
        remainingDuration: mod.remainingDuration,
      });
    });
  }
}
