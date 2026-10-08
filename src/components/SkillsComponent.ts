/**
 * @module components/SkillsComponent
 * Entity가 보유한 스킬 목록 + 각 스킬의 쿨다운 상태를 관리.
 */

import { Component } from '../core/Component';
import { SkillDef } from '../skills/SkillDef';

export interface SkillSlot {
  def: SkillDef;
  /** 쿨다운 잔여 ms (0이면 사용 가능) */
  remainingCooldown: number;
  /** 총 사용 횟수 (통계용) */
  useCount: number;
}

export class SkillsComponent extends Component {
  private _slots: Map<string, SkillSlot> = new Map();

  constructor(skills: SkillDef[] = []) {
    super();
    skills.forEach((def) => this.learn(def));
  }

  // ──────────────────────────────────────────────
  // 스킬 학습 / 망각
  // ──────────────────────────────────────────────

  learn(def: SkillDef): void {
    if (this._slots.has(def.id)) return; // 이미 보유
    this._slots.set(def.id, { def, remainingCooldown: 0, useCount: 0 });
  }

  forget(skillId: string): boolean {
    return this._slots.delete(skillId);
  }

  knows(skillId: string): boolean {
    return this._slots.has(skillId);
  }

  // ──────────────────────────────────────────────
  // 쿨다운 쿼리
  // ──────────────────────────────────────────────

  isReady(skillId: string): boolean {
    const slot = this._slots.get(skillId);
    return !!slot && slot.remainingCooldown <= 0;
  }

  getCooldown(skillId: string): number {
    return this._slots.get(skillId)?.remainingCooldown ?? 0;
  }

  getDef(skillId: string): SkillDef | undefined {
    return this._slots.get(skillId)?.def;
  }

  get allSlots(): SkillSlot[] {
    return [...this._slots.values()];
  }

  get readySkills(): SkillSlot[] {
    return this.allSlots.filter((s) => s.remainingCooldown <= 0 && !s.def.passive);
  }

  // ──────────────────────────────────────────────
  // @internal — SkillSystem만 호출
  // ──────────────────────────────────────────────

  _startCooldown(skillId: string): void {
    const slot = this._slots.get(skillId);
    if (slot) {
      slot.remainingCooldown = slot.def.cooldown;
      slot.useCount++;
    }
  }

  _tickCooldowns(delta: number): string[] {
    const readyNow: string[] = [];
    for (const [id, slot] of this._slots) {
      if (slot.remainingCooldown > 0) {
        slot.remainingCooldown = Math.max(0, slot.remainingCooldown - delta);
        if (slot.remainingCooldown === 0) readyNow.push(id);
      }
    }
    return readyNow;
  }
}
