/**
 * @module systems/ProgressionSystem
 * 경험치 획득, 레벨업, 스탯 성장 처리를 담당하는 시스템.
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { ProgressionComponent } from '../components/ProgressionComponent';
import { StatsComponent } from '../components/StatsComponent';
import { ClassComponent } from '../components/ClassComponent';

export interface AddExpRequest {
  entityId: number;
  amount: number;
}

export class ProgressionSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [ProgressionComponent];

  private _pending: AddExpRequest[] = [];
  /** 레벨업 시 체력/마나 전자동 완전 회복 여부 */
  fullHealOnLevelUp: boolean = true;

  addExp(entityId: number, amount: number): void {
    this._pending.push({ entityId, amount });
  }

  /** 엔티티에 경험치를 즉시 적용 (시스템 간 직접 호출 시 프레임 지연 방지) */
  applyExpDirect(entity: Entity, amount: number): void {
    const prog = entity.get(ProgressionComponent);
    if (!prog) return;

    const result = prog.addExp(amount);

    this.bus.emit('progression:exp_gained', {
      entityId: entity.id,
      amount,
      currentExp: prog.currentExp,
      requiredExp: prog.requiredExp,
      level: prog.level,
    });

    if (result.leveledUp) {
      this._applyLevelUp(entity, prog, result.levelsGained, result.oldLevel, result.newLevel);
    }
  }

  update(entities: Entity[], _delta: number): void {
    if (this._pending.length === 0) return;

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    for (const req of this._pending) {
      const entity = entityMap.get(req.entityId);
      if (entity) {
        this.applyExpDirect(entity, req.amount);
      }
    }

    this._pending = [];
  }

  private _applyLevelUp(
    entity: Entity,
    prog: ProgressionComponent,
    levelsGained: number,
    oldLevel: number,
    newLevel: number,
  ): void {
    const stats = entity.get(StatsComponent);
    const growth = prog.growth;

    const statsGained: Record<string, number> = {};

    if (stats) {
      if (growth.maxHp) {
        const gain = growth.maxHp * levelsGained;
        stats.maxHp += gain;
        statsGained.maxHp = gain;
      }
      if (growth.maxMp) {
        const gain = growth.maxMp * levelsGained;
        stats.maxMp = (stats.maxMp ?? 0) + gain;
        statsGained.maxMp = gain;
      }
      if (growth.attack) {
        const gain = growth.attack * levelsGained;
        stats.attack += gain;
        statsGained.attack = gain;
      }
      if (growth.defense) {
        const gain = growth.defense * levelsGained;
        stats.defense += gain;
        statsGained.defense = gain;
      }
      if (growth.speed) {
        const gain = growth.speed * levelsGained;
        stats.speed += gain;
        statsGained.speed = gain;
      }

      if (this.fullHealOnLevelUp) {
        stats.hp = stats.maxHp;
        if (stats.maxMp) stats.mp = stats.maxMp;
      }
    }

    // ClassComponent 레벨 동기화
    const classComp = entity.get(ClassComponent);
    if (classComp) {
      classComp.level = newLevel;
    }

    this.bus.emit('progression:levelup', {
      entityId: entity.id,
      oldLevel,
      newLevel,
      levelsGained,
      statsGained,
    });
  }
}
