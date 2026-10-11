/**
 * @module replay/ReplayRecorder
 * 시뮬레이션 중 발생하는 플레이어 입력 및 시스템 액션을 시간(틱) 단위로 기록하는 리플레이 레코더.
 */

import { ReplayAction, ReplayCheckpoint, ReplayData } from './types';

export interface ReplayRecorderOptions {
  version?: string;
  metadata?: Record<string, any>;
}

export class ReplayRecorder {
  readonly seed: number | string;
  readonly version: string;
  readonly metadata?: Record<string, any>;
  readonly timestamp: number;

  private _actions: ReplayAction[] = [];
  private _checkpoints: ReplayCheckpoint[] = [];

  constructor(seed: number | string, options?: ReplayRecorderOptions) {
    this.seed = seed;
    this.version = options?.version ?? '1.0.0';
    this.metadata = options?.metadata;
    this.timestamp = Date.now();
  }

  /**
   * 특정 틱 시점의 액션을 기록합니다.
   */
  recordAction(tick: number, actionType: string, payload?: any): this {
    this._actions.push({ tick, actionType, payload });
    return this;
  }

  /**
   * 결정론적 재현 검증을 위해 특정 틱의 상태 체크섬을 기록합니다.
   */
  recordCheckpoint(tick: number, stateHash: string | number): this {
    this._checkpoints.push({ tick, stateHash });
    return this;
  }

  get actionCount(): number {
    return this._actions.length;
  }

  get checkpointCount(): number {
    return this._checkpoints.length;
  }

  /**
   * 순수 ReplayData 객체로 반환합니다.
   */
  toData(): ReplayData {
    return {
      seed: this.seed,
      version: this.version,
      timestamp: this.timestamp,
      metadata: this.metadata,
      actions: [...this._actions],
      checkpoints: [...this._checkpoints],
    };
  }

  /**
   * JSON 문자열로 직렬화합니다.
   */
  toJSON(): string {
    return JSON.stringify(this.toData());
  }
}
