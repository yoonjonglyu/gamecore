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
  if (config?.mode === 'raw') {
    return value;
  }

  const mode = config?.mode ?? 'round';
  const decimals = Math.max(0, config?.decimals ?? 0);

  if (decimals === 0) {
    switch (mode) {
      case 'floor':
        return Math.floor(value + Number.EPSILON);
      case 'ceil':
        return Math.ceil(value - Number.EPSILON);
      case 'round':
      default:
        return Math.round(value);
    }
  }

  const factor = 10 ** decimals;
  switch (mode) {
    case 'floor':
      return Math.floor(value * factor + Number.EPSILON) / factor;
    case 'ceil':
      return Math.ceil(value * factor - Number.EPSILON) / factor;
    case 'round':
    default:
      return Math.round(value * factor) / factor;
  }
}
