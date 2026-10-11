/**
 * @module systems/StatusEffectSystem
 * 상태이상(버프/디버프/도트) 라이프사이클 관리 시스템.
 *
 * 1) 시간 추상화: 실시간(ms) 및 턴제(turn) 단위 틱 지원
 * 2) 도트 틱(DoT): 화상/중독 등 주기적 피해 적용 및 'status:tick:damage' 이벤트 발행
 * 3) 버프 만료/제거 시 StatModsComponent 자동 롤백 및 클린업
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { StatusEffectsComponent, StatusInstance, StackBehavior } from '../components/StatusEffectsComponent';
import { StatsComponent } from '../components/StatsComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';
import { StatModsComponent, StatModifier } from '../components/StatModsComponent';
import { StatusReactionRegistry, StatusReactionRule } from '../status/StatusReactionEngine';

export interface ApplyStatusOptions {
  tickInterval?: number;
  tickDamage?: number;
  linkedModifiers?: StatModifier[];
  stackBehavior?: StackBehavior;
}

export class StatusEffectSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [StatusEffectsComponent];
  readonly reactionRegistry: StatusReactionRegistry = new StatusReactionRegistry();

  /**
   * 반응 규칙을 간편하게 등록하는 헬퍼
   */
  registerReaction(rule: StatusReactionRule): this {
    this.reactionRegistry.register(rule);
    return this;
  }

  /**
   * 외부에서 상태이상을 안전하게 부여한다.
   * 연계된 스탯 모디파이어(linkedModifiers)가 있다면 StatModsComponent에 함께 등록하고,
   * 만료 시 자동으로 롤백될 수 있도록 연결한다.
   */
  applyStatus(
    entity: Entity,
    statusId: string,
    duration: number,
    sourceEntityId: number,
    stacks = 1,
    maxStacks = 1,
    options?: ApplyStatusOptions,
  ): void {
    let statusComp = entity.get(StatusEffectsComponent);
    if (!statusComp) {
      statusComp = new StatusEffectsComponent();
      entity.add(statusComp);
    }

    // ── 원소/상태 상호작용 (Elemental / Status Reaction) 검사 ──
    const existingIds = statusComp.all.map((s) => s.id);
    const matched = this.reactionRegistry.findMatchingRule(statusId, existingIds);

    if (matched) {
      const { rule, existingStatusId } = matched;
      const consumeMode = rule.consume ?? 'both';
      const existingInst = statusComp.get(existingStatusId)!;

      const consumedStatuses: string[] = [];
      if (consumeMode === 'both' || consumeMode === 'primary') {
        this.removeStatus(entity, existingStatusId);
        consumedStatuses.push(existingStatusId);
      }
      if (consumeMode === 'both' || consumeMode === 'secondary') {
        consumedStatuses.push(statusId);
      }

      // 반응 보너스 피해
      if (rule.bonusDamage && rule.bonusDamage > 0) {
        this._applyDirectDamage(entity, rule.bonusDamage, sourceEntityId);
      }

      // 커스텀 반응 콜백
      if (rule.onReaction) {
        const dummyNewInst: StatusInstance = {
          id: statusId,
          remainingDuration: duration,
          stacks,
          maxStacks,
          sourceEntityId,
        };
        rule.onReaction(entity, dummyNewInst, existingInst, {
          bus: this.bus,
        });
      }

      // 반응 결과 신규 상태 부여 (예: wet + freeze -> frozen)
      let appliedResultId: string | undefined;
      if (rule.resultStatus) {
        appliedResultId = rule.resultStatus.id;
        this.applyStatus(
          entity,
          rule.resultStatus.id,
          rule.resultStatus.duration,
          sourceEntityId,
          rule.resultStatus.stacks ?? 1,
          rule.resultStatus.maxStacks ?? 1,
          { tickDamage: rule.resultStatus.tickDamage },
        );
      }

      this.bus.emit('status:reaction', {
        entityId: entity.id,
        reactionName: rule.name,
        consumedStatuses,
        resultStatusId: appliedResultId,
        damage: rule.bonusDamage,
      });

      // 만약 새로 들어온 상태가 소모(consume) 대상이라면 추가 등록 스킵
      if (consumeMode === 'both' || consumeMode === 'secondary') {
        return;
      }
    }

    const linkedSourceIds: string[] = [];
    if (options?.linkedModifiers && options.linkedModifiers.length > 0) {
      let modsComp = entity.get(StatModsComponent);
      if (!modsComp) {
        modsComp = new StatModsComponent();
        entity.add(modsComp);
      }

      for (const mod of options.linkedModifiers) {
        const fullSourceId = mod.sourceId.includes(statusId)
          ? mod.sourceId
          : `status:${statusId}:${mod.sourceId}`;
        const finalMod: StatModifier = {
          ...mod,
          sourceId: fullSourceId,
          sourceEntityId,
        };
        modsComp.add(finalMod);
        linkedSourceIds.push(fullSourceId);

        this.bus.emit('stat_mod:added', {
          entityId: entity.id,
          sourceId: finalMod.sourceId,
          stat: finalMod.stat,
          flat: finalMod.flat,
          percent: finalMod.percent,
          remainingDuration: duration,
        });
      }
    }

    statusComp.apply(statusId, duration, sourceEntityId, stacks, maxStacks, {
      tickInterval: options?.tickInterval,
      tickDamage: options?.tickDamage,
      linkedModSourceIds: linkedSourceIds.length > 0 ? linkedSourceIds : undefined,
      stackBehavior: options?.stackBehavior,
    });

    const inst = statusComp.get(statusId)!;
    this.bus.emit('status:applied', {
      entityId: entity.id,
      statusId,
      duration,
      stacks: inst.stacks,
      sourceEntityId,
    });
  }

  /**
   * 직접 피해를 적용하는 내부 헬퍼 (반응 보너스 피해 등에 사용)
   */
  private _applyDirectDamage(entity: Entity, damage: number, sourceEntityId?: number): void {
    const stats = entity.get(StatsComponent);
    const extStats = entity.get(ExtendedStatsComponent);

    let prevHp = 0;
    let nextHp = 0;

    if (stats) {
      if (stats.isDead) return;
      prevHp = stats.hp;
      stats.hp = Math.max(0, stats.hp - damage);
      nextHp = stats.hp;
    } else if (extStats) {
      if (extStats.isDead) return;
      prevHp = extStats.hp;
      const res = extStats.modifyResource('hp', -damage, 'maxHp');
      nextHp = res.next;
    } else {
      return;
    }

    this.bus.emit('stats:hp:changed', {
      entityId: entity.id,
      prev: prevHp,
      next: nextHp,
      delta: -damage,
    });

    if (nextHp <= 0) {
      this.bus.emit('stats:died', { entityId: entity.id });
    }
  }

  /**
   * 상태이상을 수동 해제하고 연동된 스탯 모디파이어를 즉시 롤백한다.
   */
  removeStatus(entity: Entity, statusId: string): boolean {
    const statusComp = entity.get(StatusEffectsComponent);
    if (!statusComp) return false;

    const inst = statusComp.get(statusId);
    if (!inst) return false;

    // 연동된 스탯 모디파이어 롤백
    this._rollbackLinkedMods(entity, inst);

    statusComp.remove(statusId);
    this.bus.emit('status:removed', { entityId: entity.id, statusId });
    return true;
  }

  update(entities: Entity[], delta: number, mode: 'turn' | 'realtime' = 'realtime'): void {
    for (const entity of entities) {
      this._updateEntityStatuses(entity, delta, mode);
    }
  }

  private _updateEntityStatuses(
    entity: Entity,
    delta: number,
    mode: 'turn' | 'realtime',
  ): void {
    const statusComp = entity.get(StatusEffectsComponent);
    if (!statusComp) return;

    const allStatuses = statusComp.all;
    for (const inst of allStatuses) {
      // ── 1. 도트 틱 (DoT) 처리 ─────────────────────────
      this._processDotTick(entity, inst, delta, mode);

      // ── 2. 지속시간 차감 ────────────────────────────
      inst.remainingDuration -= delta;

      // ── 3. 만료 체크 및 스택 decay 또는 롤백 클린업 ──
      if (inst.remainingDuration <= 0) {
        if (inst.stackBehavior === 'decay' && inst.stacks > 1) {
          inst.stacks -= 1;
          inst.remainingDuration = inst.initialDuration ?? 1000;

          this.bus.emit('status:stack:decayed', {
            entityId: entity.id,
            statusId: inst.id,
            remainingStacks: inst.stacks,
          });
        } else {
          this._rollbackLinkedMods(entity, inst);
          statusComp.remove(inst.id);

          this.bus.emit('status:expired', {
            entityId: entity.id,
            statusId: inst.id,
          });
        }
      }
    }
  }

  private _processDotTick(
    entity: Entity,
    inst: StatusInstance,
    delta: number,
    mode: 'turn' | 'realtime',
  ): void {
    if (!inst.tickDamage || inst.tickDamage <= 0) return;

    let shouldTick = false;

    if (mode === 'turn') {
      // 턴제 모드에서는 매 턴(delta > 0) 틱 발동
      shouldTick = delta > 0;
    } else {
      // 실시간 모드에서는 interval 경과 시 틱 발동
      const interval = inst.tickInterval ?? 1000;
      inst.tickTime = (inst.tickTime ?? 0) + delta;
      if (inst.tickTime >= interval) {
        shouldTick = true;
        inst.tickTime -= interval;
      }
    }

    if (!shouldTick) return;

    // 도트 피해 적용
    const totalDotDamage = inst.tickDamage * inst.stacks;
    const stats = entity.get(StatsComponent);
    const extStats = entity.get(ExtendedStatsComponent);

    let prevHp = 0;
    let nextHp = 0;

    if (stats) {
      if (stats.isDead) return;
      prevHp = stats.hp;
      stats.hp = Math.max(0, stats.hp - totalDotDamage);
      nextHp = stats.hp;
    } else if (extStats) {
      if (extStats.isDead) return;
      prevHp = extStats.hp;
      const res = extStats.modifyResource('hp', -totalDotDamage, 'maxHp');
      nextHp = res.next;
    } else {
      return;
    }

    this.bus.emit('status:tick:damage', {
      entityId: entity.id,
      statusId: inst.id,
      damage: totalDotDamage,
      sourceEntityId: inst.sourceEntityId,
    });

    this.bus.emit('stats:hp:changed', {
      entityId: entity.id,
      prev: prevHp,
      next: nextHp,
      delta: -totalDotDamage,
    });

    if (nextHp <= 0) {
      this.bus.emit('stats:died', { entityId: entity.id });
    }
  }

  /**
   * 상태이상 만료 시 연동된 StatModsComponent 모디파이어를 자동 롤백 및 클린업
   */
  private _rollbackLinkedMods(entity: Entity, inst: StatusInstance): void {
    if (!inst.linkedModSourceIds || inst.linkedModSourceIds.length === 0) return;

    const modsComp = entity.get(StatModsComponent);
    if (!modsComp) return;

    for (const sourceId of inst.linkedModSourceIds) {
      const removed = modsComp.remove(sourceId);
      if (removed) {
        this.bus.emit('stat_mod:expired', {
          entityId: entity.id,
          sourceId,
          stat: 'linked',
        });
      }
    }
  }
}
