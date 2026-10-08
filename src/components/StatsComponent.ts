/**
 * @module components/StatsComponent
 * 캐릭터의 기본(베이스) 스탯을 담는 컴포넌트.
 *
 * 버프/디버프 적용 후 최종값은 `computed*` getter를 사용한다.
 * 전투 로직은 반드시 computed 값을 참조해야 한다.
 *
 * @example
 * const stats = entity.get(StatsComponent)!;
 * const mods  = entity.get(StatModsComponent);  // 없어도 OK
 * const atk   = stats.computedAttack(mods);     // 버프 반영된 공격력
 */

import { Component } from '../core/Component';
import { StatModsComponent } from './StatModsComponent';

export interface Stats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  speed: number;
}

export class StatsComponent extends Component {
  /** 기본 HP (현재 HP — 직접 변경 OK) */
  hp: number;
  /** 기본 최대 HP */
  maxHp: number;
  /** 기본 MP (현재 MP) */
  mp: number;
  /** 기본 최대 MP */
  maxMp: number;
  /** 기본 공격력 */
  attack: number;
  /** 기본 방어력 */
  defense: number;
  /** 기본 속도 */
  speed: number;

  constructor(stats: Partial<Stats> = {}) {
    super();
    this.maxHp = stats.maxHp ?? 100;
    this.hp = stats.hp ?? this.maxHp;
    this.maxMp = stats.maxMp ?? 50;
    this.mp = stats.mp ?? this.maxMp;
    this.attack = stats.attack ?? 10;
    this.defense = stats.defense ?? 5;
    this.speed = stats.speed ?? 5;
  }

  // ──────────────────────────────────────────────
  // 기본 유틸
  // ──────────────────────────────────────────────

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get hpRatio(): number {
    return this.hp / this.maxHp;
  }

  // ──────────────────────────────────────────────
  // 버프/디버프 반영 최종값 (computed)
  // StatModsComponent가 없으면 기본값을 반환한다.
  // ──────────────────────────────────────────────

  computedAttack(mods?: StatModsComponent | null): number {
    return mods?.compute('attack', this.attack) ?? this.attack;
  }

  computedDefense(mods?: StatModsComponent | null): number {
    return mods?.compute('defense', this.defense) ?? this.defense;
  }

  computedSpeed(mods?: StatModsComponent | null): number {
    return mods?.compute('speed', this.speed) ?? this.speed;
  }

  computedMaxHp(mods?: StatModsComponent | null): number {
    return mods?.compute('maxHp', this.maxHp) ?? this.maxHp;
  }

  computedMaxMp(mods?: StatModsComponent | null): number {
    return mods?.compute('maxMp', this.maxMp) ?? this.maxMp;
  }
}
