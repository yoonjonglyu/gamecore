/**
 * @module gacha/GachaEngine
 * 수집형 RPG, 방치형 영웅/장비 뽑기를 위한 가챠(소환) 및 천장(Pity) 시스템 엔진.
 * 0-Dependency 순수 TS.
 *
 * 지원 기능:
 * 1) 티어별 기본 확률 (SSR: 1%, SR: 9%, R: 90% 등)
 * 2) 소프트 천장 (Soft Pity: 특정 스택부터 최고 등급 확률 점진 상승)
 * 3) 하드 천장 (Hard Pity: 지정 스택 도달 시 최고 등급 100% 확정)
 * 4) 픽업 시스템 (50% 확률 당첨 / 픽뚫 시 다음 최고 등급 확정)
 * 5) 결정론적 PRNG (SeededRandom) 완벽 지원
 * 6) 세이브/로드를 위한 Pity 상태 직렬화
 */

import { SeededRandom } from '../math/SeededRandom';

export interface GachaItem {
  id: string | number;
  tier: string;
  isPickUp?: boolean;
}

export interface GachaTierDef {
  tier: string;
  baseRate: number; // 0.0 ~ 1.0 (예: 0.01)
  items: Array<string | number>;
  /** 픽업 전용 아이템 목록 (선택) */
  pickupItems?: Array<string | number>;
}

export interface GachaPoolConfig {
  id: string;
  /** 최상위 등급부터 하위 등급 순으로 정의 */
  tiers: GachaTierDef[];
  /** 하드 천장 뽑기 횟수 (예: 90) */
  hardPityCount?: number;
  /** 소프트 천장 시작 횟수 (예: 74) */
  softPityStart?: number;
  /** 소프트 천장 1회당 증가 확률 (예: 0.06) */
  softPityRateIncrease?: number;
  /** 픽업 당첨 확률 (기본: 0.5 = 50%) */
  pickupRate?: number;
  /** 픽뚫 후 다음 최고 등급 시 픽업 확정 지원 여부 (기본: true) */
  guaranteedNextPickup?: boolean;
}

export interface PityState {
  pityCount: number;
  isGuaranteedPickup: boolean;
}

export interface GachaResultEntry {
  itemId: string | number;
  tier: string;
  isPickUp: boolean;
  pityCountAtPull: number;
}

export class GachaEngine {
  private _pools: Map<string, GachaPoolConfig> = new Map();
  private _pityStates: Map<string, PityState> = new Map();
  private _rng: SeededRandom;

  constructor(pools: GachaPoolConfig[] = [], rng?: SeededRandom) {
    this._rng = rng ?? new SeededRandom();
    for (const pool of pools) {
      this.registerPool(pool);
    }
  }

  registerPool(pool: GachaPoolConfig): void {
    this._pools.set(pool.id, pool);
    if (!this._pityStates.has(pool.id)) {
      this._pityStates.set(pool.id, { pityCount: 0, isGuaranteedPickup: false });
    }
  }

  getPityState(poolId: string): PityState {
    const state = this._pityStates.get(poolId);
    return state ? { ...state } : { pityCount: 0, isGuaranteedPickup: false };
  }

  setPityState(poolId: string, state: Partial<PityState>): void {
    const cur = this._pityStates.get(poolId) ?? { pityCount: 0, isGuaranteedPickup: false };
    this._pityStates.set(poolId, { ...cur, ...state });
  }

  /**
   * 1회 소환(뽑기)을 실행합니다.
   */
  pull(poolId: string): GachaResultEntry {
    const pool = this._pools.get(poolId);
    if (!pool || pool.tiers.length === 0) {
      throw new Error(`Gacha pool not found: ${poolId}`);
    }

    const pity = this._pityStates.get(poolId)!;
    pity.pityCount++;

    const topTier = pool.tiers[0];
    const hardPity = pool.hardPityCount ?? 90;
    const softStart = pool.softPityStart ?? 74;
    const rateIncrease = pool.softPityRateIncrease ?? 0.06;

    // 최고 등급 확률 계산 (소프트/하드 천장 반영)
    let topRate = topTier.baseRate;
    if (pity.pityCount >= hardPity) {
      topRate = 1.0;
    } else if (pity.pityCount >= softStart) {
      const extraPulls = pity.pityCount - softStart + 1;
      topRate = Math.min(1.0, topTier.baseRate + extraPulls * rateIncrease);
    }

    // 티어 롤링 (0~1)
    const roll = this._rng.next();
    let selectedTier = pool.tiers[pool.tiers.length - 1]; // 기본 최하위

    let cumulative = 0;
    for (let i = 0; i < pool.tiers.length; i++) {
      const t = pool.tiers[i];
      const rate = i === 0 ? topRate : t.baseRate;
      cumulative += rate;
      if (roll <= cumulative) {
        selectedTier = t;
        break;
      }
    }

    const isTopTier = selectedTier.tier === topTier.tier;
    let isPickUp = false;
    let chosenItem: string | number;

    if (isTopTier) {
      const pickupRate = pool.pickupRate ?? 0.5;
      const hasPickups = selectedTier.pickupItems && selectedTier.pickupItems.length > 0;

      if (hasPickups) {
        // 확천(guaranteed) 상태이거나 픽업 확률 롤 성공 시
        if (pity.isGuaranteedPickup || this._rng.chance(pickupRate)) {
          isPickUp = true;
          chosenItem = this._rng.pick(selectedTier.pickupItems!)!;
          pity.isGuaranteedPickup = false;
        } else {
          // 픽뚫 발생
          isPickUp = false;
          chosenItem = this._rng.pick(selectedTier.items)!;
          if (pool.guaranteedNextPickup ?? true) {
            pity.isGuaranteedPickup = true;
          }
        }
      } else {
        chosenItem = this._rng.pick(selectedTier.items)!;
      }

      // 최고 등급을 획득했으므로 천장 카운트 리셋
      const pityAtPull = pity.pityCount;
      pity.pityCount = 0;
      return {
        itemId: chosenItem,
        tier: selectedTier.tier,
        isPickUp,
        pityCountAtPull: pityAtPull,
      };
    } else {
      // 일반 등급 아이템 추첨
      chosenItem = this._rng.pick(selectedTier.items)!;
      return {
        itemId: chosenItem,
        tier: selectedTier.tier,
        isPickUp: false,
        pityCountAtPull: pity.pityCount,
      };
    }
  }

  /**
   * N회 연속 소환을 실행합니다.
   */
  pullMultiple(poolId: string, count: number): GachaResultEntry[] {
    const results: GachaResultEntry[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.pull(poolId));
    }
    return results;
  }

  /**
   * 세이브 저장을 위해 모든 풀의 천장 상태를 직렬화합니다.
   */
  exportPityState(): Record<string, PityState> {
    const obj: Record<string, PityState> = {};
    for (const [k, v] of this._pityStates) {
      obj[k] = { ...v };
    }
    return obj;
  }

  /**
   * 저장된 천장 상태를 복원합니다.
   */
  importPityState(data: Record<string, PityState>): void {
    for (const [k, v] of Object.entries(data)) {
      this._pityStates.set(k, { ...v });
    }
  }
}
