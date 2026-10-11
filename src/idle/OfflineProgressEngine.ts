/**
 * @module idle/OfflineProgressEngine
 * 방치형(Idle), 시뮬레이션 및 모바일 게임을 위한 오프라인 경과 시간 누적 및 수확 계산 엔진.
 * 0-Dependency 순수 TS.
 *
 * 지원 기능:
 * 1) 경과 시간 계산 및 최대 누적 상한선(Cap: e.g. 12시간) 적용
 * 2) 초당/분당/시간당 자원(골드, 경험치 등) 생산율 및 효율 계수(efficiency) 반영
 * 3) 스태미나/행동력 점진 회복 계산
 * 4) 자동 스테이지 클리어 및 전리품(DropTable) 결정론적 수확 시뮬레이션
 */

import { SeededRandom } from '../math/SeededRandom';
import { DropTable, DropResult } from '../data/DropTable';

export type TimeUnit = 'second' | 'minute' | 'hour';

export interface StaminaRecoveryConfig {
  current: number;
  max: number;
  /** 스태미나 1 포인트 회복에 필요한 초(sec) */
  secondsPerPoint: number;
}

export interface StageSimulationConfig {
  stageId: string | number;
  /** 1회 클리어에 소요되는 기준 초(sec) */
  secondsPerClear: number;
  /** 처치 시 사용할 전리품 드랍 테이블 (선택) */
  dropTable?: DropTable;
  /** 드랍 결정론적 재현을 위한 PRNG (선택) */
  prng?: SeededRandom;
}

export interface OfflineCalculateOptions {
  /** 마지막 저장/접속 타임스탬프 (ms) */
  lastTimestamp: number;
  /** 현재 접속 타임스탬프 (ms, 기본값: Date.now()) */
  currentTimestamp?: number;
  /** 오프라인 보상 누적 최대 상한선 초(sec, e.g. 43200초 = 12시간, 기본값: 무제한) */
  maxOfflineSeconds?: number;
  /** 자원별 기본 생산율 (단위: ratesPerUnit) */
  rates?: Record<string, number>;
  /** rates의 시간 기준 단위 (기본: 'second') */
  timeUnit?: TimeUnit;
  /** 오프라인 보상 지급 배율/효율 (e.g. 0.8 = 80%만 지급, 기본: 1.0) */
  efficiency?: number;
  /** 스태미나 회복 계산 설정 (선택) */
  stamina?: StaminaRecoveryConfig;
  /** 오프라인 스테이지 클리어 시뮬레이션 설정 (선택) */
  stageSimulation?: StageSimulationConfig;
}

export interface OfflineProgressResult {
  /** 실제 경과 시간 (초) */
  elapsedSeconds: number;
  /** 상한선이 적용된 실제 계산 유효 시간 (초) */
  appliedSeconds: number;
  /** 최대 상한선(Cap)에 도달했는지 여부 */
  isCapped: boolean;
  /** 누적된 자원 목록 { gold: 1200, exp: 450, ... } */
  accumulated: Record<string, number>;
  /** 스태미나 회복 결과 (설정된 경우) */
  stamina?: {
    prev: number;
    next: number;
    recovered: number;
  };
  /** 스테이지 클리어 시뮬레이션 결과 (설정된 경우) */
  stageSimulation?: {
    stageId: string | number;
    clearCount: number;
    drops: Array<{ itemId: string | number; quantity: number }>;
  };
}

export class OfflineProgressEngine {
  /**
   * 오프라인 경과 시간을 계산하여 누적 자원, 스태미나, 스테이지 전리품을 정밀 산출합니다.
   */
  static calculate(options: OfflineCalculateOptions): OfflineProgressResult {
    const {
      lastTimestamp,
      currentTimestamp = Date.now(),
      maxOfflineSeconds = Infinity,
      rates = {},
      timeUnit = 'second',
      efficiency = 1.0,
      stamina,
      stageSimulation,
    } = options;

    const diffMs = Math.max(0, currentTimestamp - lastTimestamp);
    const elapsedSeconds = Math.floor(diffMs / 1000);
    const appliedSeconds = Math.min(elapsedSeconds, maxOfflineSeconds);
    const isCapped = elapsedSeconds > maxOfflineSeconds;

    // 1. 자원 단위 변환 계수 (초 단위 기준)
    let unitMultiplier = 1; // 'second'
    if (timeUnit === 'minute') unitMultiplier = 1 / 60;
    else if (timeUnit === 'hour') unitMultiplier = 1 / 3600;

    const accumulated: Record<string, number> = {};
    for (const [res, rate] of Object.entries(rates)) {
      const generated = appliedSeconds * (rate * unitMultiplier) * efficiency;
      accumulated[res] = Math.max(0, Math.floor(generated));
    }

    // 2. 스태미나 회복 계산
    let staminaResult: OfflineProgressResult['stamina'];
    if (stamina && stamina.secondsPerPoint > 0) {
      const pointsRecoverable = Math.floor(appliedSeconds / stamina.secondsPerPoint);
      const prev = stamina.current;
      const next = Math.min(stamina.max, prev + pointsRecoverable);
      staminaResult = {
        prev,
        next,
        recovered: next - prev,
      };
    }

    // 3. 스테이지 클리어 및 전리품 시뮬레이션
    let stageResult: OfflineProgressResult['stageSimulation'];
    if (stageSimulation && stageSimulation.secondsPerClear > 0) {
      const clearCount = Math.floor(appliedSeconds / stageSimulation.secondsPerClear);
      const aggregatedDrops = new Map<string | number, number>();

      if (clearCount > 0 && stageSimulation.dropTable) {
        const rng = stageSimulation.prng ?? new SeededRandom(lastTimestamp);
        for (let i = 0; i < clearCount; i++) {
          const drops = stageSimulation.dropTable.roll(rng);
          for (const d of drops) {
            aggregatedDrops.set(d.itemId, (aggregatedDrops.get(d.itemId) ?? 0) + d.quantity);
          }
        }
      }

      const dropsArray: Array<{ itemId: string | number; quantity: number }> = [];
      for (const [itemId, quantity] of aggregatedDrops.entries()) {
        dropsArray.push({ itemId, quantity });
      }

      stageResult = {
        stageId: stageSimulation.stageId,
        clearCount,
        drops: dropsArray,
      };
    }

    return {
      elapsedSeconds,
      appliedSeconds,
      isCapped,
      accumulated,
      stamina: staminaResult,
      stageSimulation: stageResult,
    };
  }
}
