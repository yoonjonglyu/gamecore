/**
 * @module SkillDef
 * 스킬 정의 — 이름, 코스트, 쿨다운, 적용 효과 목록, 제약조건.
 * 스킬은 여러 SkillEffect를 조합해 표현한다.
 *
 * @example
 * const fireball: SkillDef = {
 *   id: 'fireball',
 *   name: '파이어볼',
 *   mpCost: 20,
 *   cooldown: 3000,
 *   targetType: 'single_enemy',
 *   constraints: [
 *     { type: 'level', min: 10 },
 *     { type: 'class', allowed: ['mage', 'wizard'] },
 *     { type: 'weapon', allowed: ['staff', 'wand'] },
 *   ],
 *   effects: [
 *     { type: 'damage', basePower: 80, scaling: { attack: 1.2 } },
 *     { type: 'status', statusId: 'burn', chance: 0.3, duration: 2000 },
 *   ],
 * };
 */

import { Constraint } from '../constraints/Constraint';
import type { CuePayload } from '../combat/CueProtocol';

// ─── Effect 정의 ─────────────────────────────────────────────────────────────

/** 데미지 효과 */
export interface DamageEffect {
  type: 'damage';
  /** 기본 위력 */
  basePower: number;
  /** 스탯 배율 (attack: 1.2 = 공격력의 120%를 추가) */
  scaling?: Partial<Record<'attack' | 'maxHp', number>>;
  /** 방어력 무시율 0~1 */
  armorPierce?: number;
  /** 크리티컬 확률 오버라이드 */
  critChance?: number;
  /** 크리티컬 배율 오버라이드 */
  critMultiplier?: number;
}

/** 회복 효과 */
export interface HealEffect {
  type: 'heal';
  basePower: number;
  scaling?: Partial<Record<'maxHp', number>>;
  /** mp 회복 여부 */
  restoreMp?: boolean;
}

/** 상태이상 부여 효과 */
export interface StatusEffect {
  type: 'status';
  statusId: string;
  /** 발동 확률 0~1 (기본 1.0) */
  chance?: number;
  /** 지속 시간 ms */
  duration: number;
  /** 스택 수 (기본 1) */
  stacks?: number;
}

/** 스탯 버프/디버프 효과 */
export interface StatModEffect {
  type: 'stat_mod';
  stat: 'attack' | 'defense' | 'speed' | 'maxHp' | 'maxMp';
  /** 절대값 변화량 (양수=버프, 음수=디버프) */
  flat?: number;
  /** 배율 변화 (0.2 = +20%) */
  percent?: number;
  duration: number;
}

export type SkillEffectDef = DamageEffect | HealEffect | StatusEffect | StatModEffect;

// ─── 타겟팅 타입 ──────────────────────────────────────────────────────────────

export type TargetType =
  | 'self'           // 자신
  | 'single_ally'    // 아군 단일
  | 'single_enemy'   // 적 단일
  | 'all_allies'     // 아군 전체
  | 'all_enemies'    // 적 전체
  | 'all';           // 전체

// ─── SkillDef ────────────────────────────────────────────────────────────────

export interface SkillDef {
  id: string;
  name: string;
  description?: string;
  /** MP 소비량 */
  mpCost: number;
  /** 쿨다운 ms (0 = 쿨다운 없음) */
  cooldown: number;
  targetType: TargetType;
  /** 이 스킬이 적용하는 효과 목록 */
  effects: SkillEffectDef[];
  /** 사용 제약조건 — 모두 통과해야 스킬 사용 가능 */
  constraints?: Constraint[];
  /** 패시브 스킬 여부 (패시브는 SkillSystem이 자동 처리) */
  passive?: boolean;
  /** 오디오 및 VFX 연출 규격 페이로드 (CueProtocol) */
  cue?: CuePayload;
}
