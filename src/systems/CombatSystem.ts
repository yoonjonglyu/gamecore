/**
 * @module systems/CombatSystem
 * 전투 로직 시스템 — 데미지 계산, 사망 처리.
 * StatsComponent를 가진 Entity에만 동작한다.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { StatsComponent } from '../components/StatsComponent';
import { CoreEvents } from '../events';

export interface AttackRequest {
  attackerId: number;
  targetId: number;
  /** 기본 공격력 오버라이드 (없으면 attacker의 StatsComponent.attack 사용) */
  baseDamage?: number;
  /** 크리티컬 배율 (기본 1.5) */
  critMultiplier?: number;
  /** 크리티컬 확률 0~1 (기본 0.05) */
  critChance?: number;
}

export class CombatSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [StatsComponent];

  private _pendingAttacks: AttackRequest[] = [];

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

    const attackerStats = attacker.get(StatsComponent)!;
    const targetStats = target.get(StatsComponent);
    if (!targetStats || targetStats.isDead) return;

    const baseDamage = req.baseDamage ?? attackerStats.attack;
    const critChance = req.critChance ?? 0.05;
    const critMultiplier = req.critMultiplier ?? 1.5;
    const isCritical = Math.random() < critChance;

    const rawDamage = isCritical ? baseDamage * critMultiplier : baseDamage;
    const effective = Math.max(0, rawDamage - targetStats.defense);

    if (effective === 0) {
      this.bus.emit('combat:miss', { attackerId: req.attackerId, targetId: req.targetId });
      return;
    }

    const prevHp = targetStats.hp;
    targetStats.hp = Math.max(0, targetStats.hp - effective);

    this.bus.emit('combat:damage', {
      attackerId: req.attackerId,
      targetId: req.targetId,
      raw: rawDamage,
      effective,
      isCritical,
    });

    this.bus.emit('stats:hp:changed', {
      entityId: req.targetId,
      prev: prevHp,
      next: targetStats.hp,
      delta: -effective,
    });

    if (targetStats.isDead) {
      this.bus.emit('stats:died', { entityId: req.targetId });
    }
  }
}
