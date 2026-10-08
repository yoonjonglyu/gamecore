/**
 * @module components/ProgressionComponent
 * 엔티티의 경험치(EXP), 레벨, 성장곡선을 관리하는 컴포넌트.
 */

import { Component } from '../core/Component';
import { Stats } from './StatsComponent';

export type ExpFormula = (level: number) => number;

export interface StatGrowth {
  maxHp?: number;
  maxMp?: number;
  attack?: number;
  defense?: number;
  speed?: number;
}

export interface ProgressionProps {
  level?: number;
  currentExp?: number;
  maxLevel?: number;
  /** 레벨당 스탯 성장량 */
  growth?: StatGrowth;
  /** 레벨별 필요 경험치 계산식 (기본: level * 100) */
  expFormula?: ExpFormula;
}

export class ProgressionComponent extends Component {
  level: number;
  currentExp: number;
  maxLevel: number;
  growth: StatGrowth;
  private _expFormula: ExpFormula;

  constructor(props: ProgressionProps = {}) {
    super();
    this.level = props.level ?? 1;
    this.currentExp = props.currentExp ?? 0;
    this.maxLevel = props.maxLevel ?? 99;
    this.growth = props.growth ?? {
      maxHp: 10,
      maxMp: 5,
      attack: 2,
      defense: 1,
      speed: 0.5,
    };
    this._expFormula = props.expFormula ?? ((lvl) => Math.floor(100 * Math.pow(lvl, 1.5)));
  }

  /** 현재 레벨에서 다음 레벨로 가기 위한 총 경험치 */
  get requiredExp(): number {
    return this._expFormula(this.level);
  }

  get isMaxLevel(): boolean {
    return this.level >= this.maxLevel;
  }

  /** 경험치 추가 및 레벨업 계산 (연속 레벨업 지원) */
  addExp(amount: number): { leveledUp: boolean; oldLevel: number; newLevel: number; levelsGained: number } {
    if (this.isMaxLevel) {
      return { leveledUp: false, oldLevel: this.level, newLevel: this.level, levelsGained: 0 };
    }

    const oldLevel = this.level;
    this.currentExp += amount;

    let levelsGained = 0;
    while (!this.isMaxLevel && this.currentExp >= this.requiredExp) {
      this.currentExp -= this.requiredExp;
      this.level++;
      levelsGained++;
    }

    if (this.isMaxLevel) {
      this.currentExp = 0;
    }

    return {
      leveledUp: levelsGained > 0,
      oldLevel,
      newLevel: this.level,
      levelsGained,
    };
  }
}
