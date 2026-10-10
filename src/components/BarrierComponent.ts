/**
 * @module components/BarrierComponent
 * 데미지를 흡수하는 쉴드/보호막 컴포넌트.
 *
 * HP가 차감되기 전에 쉴드가 먼저 데미지를 흡수하며,
 * 쉴드가 완전히 소진(broken)되면 남은 관통 데미지만 HP에 반영된다.
 */

import { Component } from '../core/Component';

export interface BarrierProps {
  current?: number;
  max?: number;
}

export interface BarrierAbsorbResult {
  absorbed: number;
  remainingDamage: number;
  broken: boolean;
}

export class BarrierComponent extends Component {
  current: number;
  max: number;

  constructor(props: BarrierProps = {}) {
    super();
    this.max = props.max ?? props.current ?? 0;
    this.current = props.current ?? this.max;
  }

  get isDepleted(): boolean {
    return this.current <= 0;
  }

  /**
   * 들어온 데미지를 쉴드로 흡수한다.
   * @param incomingDamage 유입된 데미지
   * @returns 흡수량, 미흡수 잔여 데미지, 쉴드 파괴 여부
   */
  absorb(incomingDamage: number): BarrierAbsorbResult {
    if (this.current <= 0 || incomingDamage <= 0) {
      return { absorbed: 0, remainingDamage: incomingDamage, broken: false };
    }

    if (this.current >= incomingDamage) {
      this.current -= incomingDamage;
      return {
        absorbed: incomingDamage,
        remainingDamage: 0,
        broken: this.current === 0,
      };
    } else {
      const absorbed = this.current;
      const remainingDamage = incomingDamage - absorbed;
      this.current = 0;
      return {
        absorbed,
        remainingDamage,
        broken: true,
      };
    }
  }

  /**
   * 쉴드를 충전/회복한다.
   */
  recharge(amount: number): number {
    const prev = this.current;
    this.current = Math.min(this.max, this.current + amount);
    return this.current - prev;
  }

  /**
   * 최대치 및 현재치를 동시에 증가/부여한다.
   */
  addBarrier(amount: number): void {
    this.max += amount;
    this.current += amount;
  }
}
