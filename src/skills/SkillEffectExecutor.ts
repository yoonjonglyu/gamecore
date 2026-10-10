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
import { StatusEffectsComponent } from '../components/StatusEffectsComponent';
import { StatModsComponent, StatModifier } from '../components/StatModsComponent';
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
      const { caster, target, bus } = ctx;
      const casterStats = caster.get(StatsComponent);
      const casterExt = caster.get(ExtendedStatsComponent);
      const targetStats = target.get(StatsComponent);
      const targetExt = target.get(ExtendedStatsComponent);

      const isTargetDead = targetStats?.isDead || targetExt?.isDead;
      if (isTargetDead) return;

      const atk = casterStats ? casterStats.attack : (casterExt ? casterExt.get('attack') : 10);
      const maxHp = casterStats ? casterStats.maxHp : (casterExt ? casterExt.get('maxHp') : 100);
      const targetDef = targetStats ? targetStats.defense : (targetExt ? targetExt.get('defense') : 0);

      let power = effect.basePower ?? (effect as any).baseDamage ?? 0;
      if (effect.scaling) {
        if (effect.scaling.attack) power += atk * effect.scaling.attack;
        if (effect.scaling.maxHp) power += maxHp * effect.scaling.maxHp;
      }

      const critChance = effect.critChance ?? 0.05;
      const critMult = effect.critMultiplier ?? 1.5;
      const isCritical = Math.random() < critChance;
      const raw = isCritical ? power * critMult : power;

      const armorPierce = effect.armorPierce ?? 0;
      const effectiveDefense = targetDef * (1 - armorPierce);
      const effective = Math.max(0, raw - effectiveDefense);

      if (effective === 0) {
        bus.emit('combat:miss', { attackerId: caster.id, targetId: target.id });
        return;
      }

      let prevHp = 0;
      let nextHp = 0;

      if (targetStats) {
        prevHp = targetStats.hp;
        targetStats.hp = Math.max(0, targetStats.hp - effective);
        nextHp = targetStats.hp;
      } else if (targetExt) {
        prevHp = targetExt.hp;
        const res = targetExt.modifyResource('hp', -effective, 'maxHp');
        nextHp = res.next;
      }

      bus.emit('combat:damage', {
        attackerId: caster.id,
        targetId: target.id,
        raw,
        effective,
        isCritical,
      });

      bus.emit('stats:hp:changed', {
        entityId: target.id,
        prev: prevHp,
        next: nextHp,
        delta: -effective,
      });

      if (nextHp <= 0) {
        bus.emit('stats:died', { entityId: target.id });
      }
    });

    // ── 치유 효과 ─────────────────────────────
    this.register<HealEffect>('heal', (effect, ctx) => {
      const { target, bus } = ctx;
      const targetStats = target.get(StatsComponent);
      const targetExt = target.get(ExtendedStatsComponent);
      if (!targetStats && !targetExt) return;

      const maxHp = targetStats ? targetStats.maxHp : targetExt!.get('maxHp');
      let amount = effect.basePower;
      if (effect.scaling?.maxHp) {
        amount += maxHp * effect.scaling.maxHp;
      }

      let prevHp = 0;
      let nextHp = 0;

      if (targetStats) {
        prevHp = targetStats.hp;
        targetStats.hp = Math.min(targetStats.maxHp, targetStats.hp + amount);
        nextHp = targetStats.hp;
      } else if (targetExt) {
        prevHp = targetExt.hp;
        const res = targetExt.modifyResource('hp', amount, 'maxHp');
        nextHp = res.next;
      }

      bus.emit('stats:hp:changed', {
        entityId: target.id,
        prev: prevHp,
        next: nextHp,
        delta: amount,
      });

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
      const { caster, target, bus } = ctx;
      const chance = effect.chance ?? 1.0;
      if (Math.random() > chance) return;

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
      const { caster, target, bus } = ctx;
      const mod: StatModifier = {
        sourceId: `skill:${effect.stat}:${caster.id}`,
        stat: effect.stat,
        flat: effect.flat,
        percent: effect.percent,
        remainingDuration: effect.duration,
        sourceEntityId: caster.id,
      };

      if (!target.has(StatModsComponent)) {
        target.add(new StatModsComponent());
      }
      target.get(StatModsComponent)!.add(mod);

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
