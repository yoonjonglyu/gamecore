/**
 * @module constraints/ConstraintChecker
 * 제약조건 목록을 Entity에 대해 평가한다.
 *
 * 표준 제약조건은 내장 핸들러로 처리하고,
 * custom 제약조건은 registerCustomHandler로 핸들러를 등록해 확장한다.
 *
 * @example
 * // 기본 사용
 * const checker = new ConstraintChecker();
 * const result = checker.check(entity, skill.constraints ?? []);
 * if (!result.ok) console.log(result.reason);
 *
 * @example
 * // 커스텀 제약조건 등록
 * checker.registerCustomHandler('quest_complete', (entity, data) => {
 *   const quests = entity.get(QuestComponent);
 *   const ok = quests?.isComplete(data as string) ?? false;
 *   return ok ? { ok: true } : { ok: false, failed: ..., reason: '퀘스트 미완료' };
 * });
 */

import { Entity } from '../core/Entity';
import { ClassComponent } from '../components/ClassComponent';
import { EquipmentComponent } from '../components/EquipmentComponent';
import { StatsComponent } from '../components/StatsComponent';
import { StatusEffectsComponent } from '../components/StatusEffectsComponent';
import {
  Constraint,
  ConstraintResult,
  CustomConstraint,
} from './Constraint';

export type CustomHandler = (
  entity: Entity,
  data: unknown,
  constraint: CustomConstraint,
) => ConstraintResult;

export class ConstraintChecker {
  private _customHandlers: Map<string, CustomHandler> = new Map();

  // ──────────────────────────────────────────────
  // 커스텀 핸들러 등록
  // ──────────────────────────────────────────────

  /**
   * 사용자 정의 제약조건 핸들러를 등록한다.
   * @param id CustomConstraint.id 와 일치해야 한다.
   */
  registerCustomHandler(id: string, handler: CustomHandler): void {
    this._customHandlers.set(id, handler);
  }

  unregisterCustomHandler(id: string): void {
    this._customHandlers.delete(id);
  }

  // ──────────────────────────────────────────────
  // 제약조건 평가
  // ──────────────────────────────────────────────

  /**
   * 모든 제약조건을 순서대로 평가한다.
   * 첫 번째 실패한 제약조건에서 즉시 반환한다.
   */
  check(entity: Entity, constraints: Constraint[]): ConstraintResult {
    for (const constraint of constraints) {
      const result = this._evaluate(entity, constraint);
      if (!result.ok) return result;
    }
    return { ok: true };
  }

  /**
   * 모든 제약조건을 평가하고 실패한 것들을 전부 반환한다.
   */
  checkAll(entity: Entity, constraints: Constraint[]): ConstraintResult[] {
    return constraints.map((c) => this._evaluate(entity, c));
  }

  // ──────────────────────────────────────────────
  // 내장 평가 로직
  // ──────────────────────────────────────────────

  private _evaluate(entity: Entity, constraint: Constraint): ConstraintResult {
    switch (constraint.type) {
      case 'level':
        return this._checkLevel(entity, constraint);
      case 'class':
        return this._checkClass(entity, constraint);
      case 'weapon':
        return this._checkWeapon(entity, constraint);
      case 'element':
        return this._checkElement(entity, constraint);
      case 'stat_min':
        return this._checkStatMin(entity, constraint);
      case 'has_status':
        return this._checkHasStatus(entity, constraint);
      case 'not_status':
        return this._checkNotStatus(entity, constraint);
      case 'custom':
        return this._checkCustom(entity, constraint);
    }
  }

  private _checkLevel(entity: Entity, c: Extract<Constraint, { type: 'level' }>): ConstraintResult {
    const cls = entity.get(ClassComponent);
    if (!cls) {
      return { ok: false, failed: c, reason: `레벨 정보 없음 (ClassComponent 필요)` };
    }
    if (c.min !== undefined && cls.level < c.min) {
      return { ok: false, failed: c, reason: `레벨 부족 (필요: ${c.min}, 현재: ${cls.level})` };
    }
    if (c.max !== undefined && cls.level > c.max) {
      return { ok: false, failed: c, reason: `레벨 초과 (최대: ${c.max}, 현재: ${cls.level})` };
    }
    return { ok: true };
  }

  private _checkClass(entity: Entity, c: Extract<Constraint, { type: 'class' }>): ConstraintResult {
    const cls = entity.get(ClassComponent);
    if (!cls) {
      return { ok: false, failed: c, reason: `직업 정보 없음 (ClassComponent 필요)` };
    }
    if (!c.allowed.includes(cls.classId)) {
      return {
        ok: false,
        failed: c,
        reason: `직업 불일치 (허용: [${c.allowed.join(', ')}], 현재: ${cls.classId})`,
      };
    }
    return { ok: true };
  }

  private _checkWeapon(entity: Entity, c: Extract<Constraint, { type: 'weapon' }>): ConstraintResult {
    const equip = entity.get(EquipmentComponent);
    if (!equip) {
      return { ok: false, failed: c, reason: `장비 정보 없음 (EquipmentComponent 필요)` };
    }
    const equipped = equip.equippedWeaponTypes;
    const hasAllowed = c.allowed.some((t) => equipped.includes(t));
    if (!hasAllowed) {
      return {
        ok: false,
        failed: c,
        reason: `무기 타입 불일치 (허용: [${c.allowed.join(', ')}], 장착 중: [${equipped.join(', ') || '없음'}])`,
      };
    }
    return { ok: true };
  }

  private _checkElement(entity: Entity, c: Extract<Constraint, { type: 'element' }>): ConstraintResult {
    const cls = entity.get(ClassComponent);
    const equip = entity.get(EquipmentComponent);

    // 캐릭터 속성 + 장착 아이템 속성 합산
    const entityElements = [
      ...(cls?.elements ?? []),
      ...(equip?.equippedElements ?? []),
    ];

    const hasAllowed = c.allowed.some((e) => entityElements.includes(e));
    if (!hasAllowed) {
      return {
        ok: false,
        failed: c,
        reason: `속성 불일치 (허용: [${c.allowed.join(', ')}], 보유: [${entityElements.join(', ') || '없음'}])`,
      };
    }
    return { ok: true };
  }

  private _checkStatMin(entity: Entity, c: Extract<Constraint, { type: 'stat_min' }>): ConstraintResult {
    const stats = entity.get(StatsComponent);
    if (!stats) {
      return { ok: false, failed: c, reason: `스탯 정보 없음 (StatsComponent 필요)` };
    }
    const value = (stats as any)[c.stat];
    if (typeof value !== 'number') {
      return { ok: false, failed: c, reason: `알 수 없는 스탯: ${c.stat}` };
    }
    if (value < c.value) {
      return {
        ok: false,
        failed: c,
        reason: `${c.stat} 부족 (필요: ${c.value}, 현재: ${value})`,
      };
    }
    return { ok: true };
  }

  private _checkHasStatus(entity: Entity, c: Extract<Constraint, { type: 'has_status' }>): ConstraintResult {
    const statuses = entity.get(StatusEffectsComponent);
    if (!statuses?.has(c.statusId)) {
      return {
        ok: false,
        failed: c,
        reason: `상태이상 미보유: ${c.statusId}`,
      };
    }
    return { ok: true };
  }

  private _checkNotStatus(entity: Entity, c: Extract<Constraint, { type: 'not_status' }>): ConstraintResult {
    const statuses = entity.get(StatusEffectsComponent);
    if (statuses?.has(c.statusId)) {
      return {
        ok: false,
        failed: c,
        reason: `${c.statusId} 상태이상으로 사용 불가`,
      };
    }
    return { ok: true };
  }

  private _checkCustom(entity: Entity, c: CustomConstraint): ConstraintResult {
    const handler = this._customHandlers.get(c.id);
    if (!handler) {
      // 핸들러 미등록 시 경고 없이 통과 (관대한 정책)
      // 엄격하게 하려면 return { ok: false, failed: c, reason: `커스텀 핸들러 미등록: ${c.id}` }
      return { ok: true };
    }
    return handler(entity, c.data, c);
  }
}

/** 전역 공유 인스턴스 (선택적으로 사용) */
export const globalConstraintChecker = new ConstraintChecker();
