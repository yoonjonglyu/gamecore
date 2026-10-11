/**
 * @module replay/types
 * 결정론적 전투 및 게임 시뮬레이션 리플레이 데이터 규격.
 */

export interface ReplayAction {
  /** 액션이 발생한 시점 (update 틱 번호 또는 턴 번호) */
  tick: number;
  /** 액션 타입 식별자 (예: 'use_skill', 'move', 'equip_item') */
  actionType: string;
  /** 액션 상세 페이로드 데이터 */
  payload?: any;
}

export interface ReplayCheckpoint {
  /** 체크포인트 검증 시점 틱 */
  tick: number;
  /** 월드 상태 해시 또는 검증용 체크섬/수치 */
  stateHash: string | number;
}

export interface ReplayData {
  /** 초기 PRNG 시드 (결정론적 재현 보장) */
  seed: number | string;
  /** 엔진/게임 버전 */
  version: string;
  /** 녹화 시작 타임스탬프 */
  timestamp: number;
  /** 추가 초기 메타데이터 (참가자 명단, 던전 ID 등) */
  metadata?: Record<string, any>;
  /** 시간순 액션 로그 목록 */
  actions: ReplayAction[];
  /** 결정론적 무결성 검증을 위한 상태 체크포인트 목록 */
  checkpoints: ReplayCheckpoint[];
}
