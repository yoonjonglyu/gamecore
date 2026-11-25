/**
 * @module math/RoundingPolicy
 * 수치 계산 시 부동소수점 오차를 방지하고 정밀도 및 반올림/내림/올림 정책을 표준화하는 유틸리티.
 */

export type RoundingMode = 'round' | 'floor' | 'ceil' | 'raw';

export interface CombatRoundingConfig {
  /**
   * 라운딩 모드:
   * - 'round': 사사오입 (기본값)
   * - 'floor': 내림 (버림)
   * - 'ceil': 올림
   * - 'raw': 라운딩 미적용 (원본 부동소수점 유지)
   */
  mode?: RoundingMode;
  /**
   * 보존할 소수점 자릿수 (기본값: 0, 정수 보장)
   */
  decimals?: number;
}

export const DEFAULT_ROUNDING_CONFIG: Required<CombatRoundingConfig> = {
  mode: 'round',
  decimals: 0,
};

/**
 * 주어진 값에 라운딩 정책을 적용하여 반환한다.
 * 부동소수점 미세 오차를 방지하기 위해 정밀도 보정을 수행한다.
 */
export function applyRounding(value: number, config?: CombatRoundingConfig): number {
  if (config?.mode === 'raw' || !Number.isFinite(value)) {
    return value;
  }

  const mode = config?.mode ?? 'round';
  const rawDecimals = config?.decimals ?? 0;
  const decimals = Number.isFinite(rawDecimals)
    ? Math.min(15, Math.max(0, Math.trunc(rawDecimals)))
    : 0;

  const factor = decimals === 0 ? 1 : 10 ** decimals;
  const scaled = value * factor;
  // 크기에 비례한 IEEE-754 미세 부동소수점 오차 보정 (예: 0.29 * 100 = 28.999999999999996 -> 29)
  const eps = Math.max(Number.EPSILON, Math.abs(scaled) * 1e-12);

  let roundedScaled: number;
  switch (mode) {
    case 'floor':
      roundedScaled = Math.floor(scaled + eps);
      break;
    case 'ceil':
      roundedScaled = Math.ceil(scaled - eps);
      break;
    case 'round':
    default: {
      // Half-away-from-zero / standard positive half-up with float noise compensation (1.005 * 100 = 100.49999999999999)
      if (scaled >= 0) {
        roundedScaled = Math.round(scaled + eps);
      } else {
        roundedScaled = Math.round(scaled - eps);
      }
      break;
    }
  }

  const result = decimals === 0 ? roundedScaled : roundedScaled / factor;
  return result === 0 ? 0 : result;
}
