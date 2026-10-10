import { Component } from '../core/Component';
import { SeededRandom } from '../math/SeededRandom';

export interface LootItemEntry {
  itemId: string | number;
  /** 드랍 확률 0~1 (1.0 = 100%) */
  chance: number;
  /** 최소 드랍 수량 (기본 1) */
  min?: number;
  /** 최대 드랍 수량 (기본 1) */
  max?: number;
}

export interface LootProps {
  /** 처치 시 부여할 경험치 */
  exp?: number;
  /** 드랍 테이블 목록 */
  items?: LootItemEntry[];
}

export class LootComponent extends Component {
  exp: number;
  items: LootItemEntry[];

  constructor(props: LootProps = {}) {
    super();
    this.exp = props.exp ?? 0;
    this.items = props.items ?? [];
  }

  /** 확률 계산을 거쳐 실제 드랍될 아이템 목록을 산출 (SeededRandom 지원) */
  rollDrops(random?: SeededRandom): Array<{ itemId: string | number; quantity: number }> {
    const drops: Array<{ itemId: string | number; quantity: number }> = [];

    for (const entry of this.items) {
      const roll = random ? random.chance(entry.chance) : Math.random() <= entry.chance;
      if (roll) {
        const min = entry.min ?? 1;
        const max = entry.max ?? min;
        const quantity = random
          ? random.nextInt(min, max)
          : Math.floor(Math.random() * (max - min + 1)) + min;
        if (quantity > 0) {
          drops.push({ itemId: entry.itemId, quantity });
        }
      }
    }

    return drops;
  }
}
