/**
 * @module components/TurnComponent
 * 턴제 전투에서 엔티티의 행동력(AP), 이니셔티브, 턴 상태를 관리하는 컴포넌트.
 */

import { Component } from '../core/Component';

export interface TurnProps {
  /** 수동 지정 이니셔티브 (없으면 StatsComponent의 speed 사용) */
  initiative?: number;
  /** 현재 행동력 (Action Points) */
  actionPoints?: number;
  /** 최대 행동력 */
  maxActionPoints?: number;
}

export class TurnComponent extends Component {
  initiative?: number;
  actionPoints: number;
  maxActionPoints: number;

  constructor(props: TurnProps = {}) {
    super();
    this.initiative = props.initiative;
    this.actionPoints = props.actionPoints ?? 1;
    this.maxActionPoints = props.maxActionPoints ?? 1;
  }

  /** 턴 시작 시 행동력 리셋 */
  resetAP(): void {
    this.actionPoints = this.maxActionPoints;
  }

  /** 행동력 소비 */
  consumeAP(amount: number = 1): boolean {
    if (this.actionPoints >= amount) {
      this.actionPoints -= amount;
      return true;
    }
    return false;
  }

  get canAct(): boolean {
    return this.actionPoints > 0;
  }
}
