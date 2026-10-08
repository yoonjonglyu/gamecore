/**
 * @module constraints/Constraint
 * 스킬/아이템 사용·장착 제약조건 타입 정의.
 *
 * 표준 제약조건:
 *  - level    : 최소/최대 레벨
 *  - class    : 허용 직업 목록
 *  - weapon   : 허용 장착 무기 타입
 *  - element  : 허용 속성 (불·물·바람 등)
 *  - stat_min : 특정 스탯 최솟값
 *  - has_status : 특정 상태이상 보유 여부
 *  - not_status : 특정 상태이상 미보유 여부
 *  - custom   : 사용자 정의 제약조건 (id로 식별)
 *
 * 제약조건은 배열로 선언되며 **모두 통과해야** 사용 가능하다.
 *
 * @example
 * const constraints: Constraint[] = [
 *   { type: 'level', min: 10 },
 *   { type: 'class', allowed: ['warrior', 'paladin'] },
 *   { type: 'weapon', allowed: ['sword', 'greatsword'] },
 * ];
 */

// ─── 결과 타입 ────────────────────────────────────────────────────────────────

export type ConstraintResult =
  | { ok: true }
  | { ok: false; failed: Constraint; reason: string };

// ─── 표준 제약조건 ─────────────────────────────────────────────────────────────

/** 레벨 범위 */
export interface LevelConstraint {
  type: 'level';
  min?: number;
  max?: number;
}

/** 직업(클래스) 제한 */
export interface ClassConstraint {
  type: 'class';
  /** 허용 직업 목록 (하나라도 일치하면 통과) */
  allowed: string[];
}

/** 장착 무기 타입 제한 */
export interface WeaponConstraint {
  type: 'weapon';
  /** 허용 무기 타입 (예: 'sword', 'staff', 'bow') */
  allowed: string[];
}

/** 속성 제한 */
export interface ElementConstraint {
  type: 'element';
  /** 허용 속성 (예: 'fire', 'water', 'wind') */
  allowed: string[];
}

/** 스탯 최솟값 */
export interface StatMinConstraint {
  type: 'stat_min';
  /** StatsComponent의 필드명 (예: 'attack', 'maxHp') */
  stat: string;
  value: number;
}

/** 특정 상태이상 보유 필요 */
export interface HasStatusConstraint {
  type: 'has_status';
  statusId: string;
}

/** 특정 상태이상 없어야 함 */
export interface NotStatusConstraint {
  type: 'not_status';
  statusId: string;
}

/** 사용자 정의 제약조건 — ConstraintChecker에 커스텀 핸들러를 등록해 사용 */
export interface CustomConstraint {
  type: 'custom';
  id: string;
  /** 핸들러에 전달할 임의 데이터 */
  data?: unknown;
}

export type Constraint =
  | LevelConstraint
  | ClassConstraint
  | WeaponConstraint
  | ElementConstraint
  | StatMinConstraint
  | HasStatusConstraint
  | NotStatusConstraint
  | CustomConstraint;
