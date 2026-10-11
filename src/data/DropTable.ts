/**
 * @module data/DropTable
 * 절차적 전리품 및 확률/가중치 기반 드랍 테이블 엔진.
 * SeededRandom과 연동하여 100% 결정론적 드랍 롤링을 보장한다.
 */

import { SeededRandom } from '../math/SeededRandom';

export interface DropEntry {
  itemId: string | number;
  /**
   * 독립 드랍 확률 (0.0 ~ 1.0, 예: 0.25 = 25% 확률로 드랍 판정)
   * rollIndependent() 시 사용.
   */
  chance?: number;
  /**
   * 가중치 (rollWeighted() 시 사용, 예: 100, 50, 10)
   */
  weight?: number;
  /** 최소 드랍 수량 (기본: 1) */
  min?: number;
  /** 최대 드랍 수량 (기본: 1) */
  max?: number;
}

export interface DropResult {
  itemId: string | number;
  quantity: number;
}

export class DropTable {
  readonly id: string;
  private _entries: DropEntry[] = [];

  constructor(id: string = 'default', entries: DropEntry[] = []) {
    this.id = id;
    this._entries = [...entries];
  }

  addEntry(entry: DropEntry): this {
    this._entries.push(entry);
    return this;
  }

  get entries(): readonly DropEntry[] {
    return this._entries;
  }

  /**
   * 1. 독립 확률 드랍 롤링:
   * 각 아이템의 chance(0~1) 확률을 개별 주사위로 굴려 당첨된 아이템들을 반환한다.
   * (여러 아이템이 동시에 드랍될 수 있음)
   */
  rollIndependent(random?: SeededRandom): DropResult[] {
    const results: DropResult[] = [];

    for (const entry of this._entries) {
      const chance = entry.chance ?? 1.0;
      const roll = random ? random.chance(chance) : Math.random() < chance;

      if (roll) {
        const min = entry.min ?? 1;
        const max = entry.max ?? min;
        const quantity = random ? random.nextInt(min, max) : Math.floor(Math.random() * (max - min + 1)) + min;

        if (quantity > 0) {
          results.push({ itemId: entry.itemId, quantity });
        }
      }
    }

    return results;
  }

  /**
   * 2. 가중치 기반 단일/N회 추첨 롤링:
   * 등록된 가중치(weight) 풀에서 count개의 아이템을 비복원/복원 추출한다.
   * (예: 보물상자에서 가중치 기반으로 정확히 1개 또는 3개 아이템 추첨)
   */
  rollWeighted(count: number = 1, random?: SeededRandom): DropResult[] {
    if (this._entries.length === 0 || count <= 0) return [];

    const totalWeight = this._entries.reduce((sum, e) => sum + (e.weight ?? 1), 0);
    if (totalWeight <= 0) return [];

    const results: DropResult[] = [];

    for (let c = 0; c < count; c++) {
      const target = random ? random.nextFloat(0, totalWeight) : Math.random() * totalWeight;
      let accumulated = 0;

      for (const entry of this._entries) {
        accumulated += entry.weight ?? 1;
        if (target <= accumulated) {
          const min = entry.min ?? 1;
          const max = entry.max ?? min;
          const quantity = random ? random.nextInt(min, max) : Math.floor(Math.random() * (max - min + 1)) + min;

          // 이미 뽑힌 아이템이 있다면 수량 합산
          const existing = results.find((r) => r.itemId === entry.itemId);
          if (existing) {
            existing.quantity += quantity;
          } else {
            results.push({ itemId: entry.itemId, quantity });
          }
          break;
        }
      }
    }

    return results;
  }

  /**
   * 기본 독립 확률 드랍을 수행하는 편의 메서드 (rollIndependent의 별칭).
   */
  roll(random?: SeededRandom): DropResult[] {
    return this.rollIndependent(random);
  }
}
