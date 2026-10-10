/**
 * @module components/StatsComponent
 * 캐릭터의 기본(베이스) 스탯을 갖는 컴포넌트.
 *
 * 버프/디버프 적용 후 최종값은 `computed*` getter를 사용한다.
 * 전투 로직은 반드시 computed 값을 참조해야 한다.
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

export type StatsProps = Partial<Stats>;

export class StatsComponent extends Component {
  /** 기본 HP (현재 HP 및 직접 변경 OK) */
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
  /** 기본 이동/행동 속도 */
  speed: number;

  constructor(init: Partial<Stats> = {}) {
    super();
    this.maxHp = init.maxHp ?? 100;
    this.hp = init.hp ?? this.maxHp;
    this.maxMp = init.maxMp ?? 50;
    this.mp = init.mp ?? this.maxMp;
    this.attack = init.attack ?? 10;
    this.defense = init.defense ?? 5;
    this.speed = init.speed ?? 10;
  }

  // ──────────────────────────────────────────────
  // Computed Getters (버프/디버프 적용 최종값)
  // ──────────────────────────────────────────────

  computedAttack(mods?: StatModsComponent): number {
    return mods ? mods.compute('attack', this.attack) : this.attack;
  }

  computedDefense(mods?: StatModsComponent): number {
    return mods ? mods.compute('defense', this.defense) : this.defense;
  }

  computedSpeed(mods?: StatModsComponent): number {
    return mods ? mods.compute('speed', this.speed) : this.speed;
  }

  computedMaxHp(mods?: StatModsComponent): number {
    return mods ? mods.compute('maxHp', this.maxHp) : this.maxHp;
  }

  computedMaxMp(mods?: StatModsComponent): number {
    return mods ? mods.compute('maxMp', this.maxMp) : this.maxMp;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get isAlive(): boolean {
    return this.hp > 0;
  }

  get hpPercent(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  get mpPercent(): number {
    return this.maxMp > 0 ? this.mp / this.maxMp : 0;
  }
}
