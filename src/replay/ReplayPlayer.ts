/**
 * @module replay/ReplayPlayer
 * 기록된 ReplayData를 읽어 시간(틱)에 맞추어 액션을 주입하고,
 * 체크포인트를 통해 시뮬레이션의 결정론적 무결성(Desync 여부)을 검증하는 리플레이 플레이어.
 */

import { ReplayAction, ReplayData } from './types';

export interface StepResult {
  hasMore: boolean;
  currentTick: number;
  actionsExecuted: number;
  desynced: boolean;
  expectedHash?: string | number;
  actualHash?: string | number;
}

export interface PlayResult {
  completed: boolean;
  desynced: boolean;
  finalTick: number;
  totalActionsExecuted: number;
  desyncTick?: number;
}

export class ReplayPlayer {
  readonly data: ReplayData;
  private _cursor = 0;
  private _checkpointCursor = 0;
  private _currentTick = 0;

  constructor(replay: ReplayData | string) {
    const parsed: ReplayData = typeof replay === 'string' ? JSON.parse(replay) : replay;
    this.data = {
      ...parsed,
      // 호출자 배열 변이 방지를 위해 얕은 복사 후 틱 기준 오름차순 정렬
      actions: [...parsed.actions].sort((a, b) => a.tick - b.tick),
      checkpoints: [...parsed.checkpoints].sort((a, b) => a.tick - b.tick),
    };
  }

  get currentTick(): number {
    return this._currentTick;
  }

  get isFinished(): boolean {
    return (
      this._cursor >= this.data.actions.length &&
      this._checkpointCursor >= this.data.checkpoints.length
    );
  }

  private _dispatchActionsUpTo(tick: number, onAction: (action: ReplayAction) => void): number {
    let actionsExecuted = 0;
    while (this._cursor < this.data.actions.length && this.data.actions[this._cursor].tick <= tick) {
      const action = this.data.actions[this._cursor];
      onAction(action);
      actionsExecuted++;
      this._cursor++;
    }
    return actionsExecuted;
  }

  private _verifyCheckpointsUpTo(
    tick: number,
    getStateHash?: () => string | number,
  ): { desynced: boolean; expectedHash?: string | number; actualHash?: string | number } {
    let desynced = false;
    let expectedHash: string | number | undefined;
    let actualHash: string | number | undefined;

    while (
      this._checkpointCursor < this.data.checkpoints.length &&
      this.data.checkpoints[this._checkpointCursor].tick <= tick
    ) {
      const cp = this.data.checkpoints[this._checkpointCursor];
      const cpExpected = cp.stateHash;
      let cpActual: string | number | undefined;
      let cpMismatch = false;

      if (getStateHash) {
        cpActual = getStateHash();
        if (String(cpExpected) !== String(cpActual)) {
          cpMismatch = true;
        }
      }

      if (!desynced) {
        expectedHash = cpExpected;
        actualHash = cpActual;
        if (cpMismatch) {
          desynced = true;
        }
      }
      this._checkpointCursor++;
    }

    return { desynced, expectedHash, actualHash };
  }

  /**
   * 지정된 틱의 액션들을 디스패치하고, 해당 틱까지의 체크포인트가 있다면 검증합니다.
   *
   * @param tick 현재 틱 번호
   * @param onAction 액션 실행 핸들러
   * @param getStateHash 현재 월드/엔티티의 체크섬 계산 콜백 (선택)
   */
  processTick(
    tick: number,
    onAction: (action: ReplayAction) => void,
    getStateHash?: () => string | number,
  ): StepResult {
    this._currentTick = tick;
    const actionsExecuted = this._dispatchActionsUpTo(tick, onAction);
    const { desynced, expectedHash, actualHash } = this._verifyCheckpointsUpTo(tick, getStateHash);

    return {
      hasMore: !this.isFinished,
      currentTick: tick,
      actionsExecuted,
      desynced,
      expectedHash,
      actualHash,
    };
  }

  /**
   * 처음(0틱)부터 끝까지 전체 리플레이를 실행하고 검증합니다.
   * 각 틱에서 액션 실행 -> advanceTick(t) -> 체크포인트 해시 검증 순으로 진행합니다.
   *
   * @param advanceTick 매 틱마다 월드 업데이트를 진행하는 콜백 (예: (tick) => world.update(16))
   * @param onAction 액션 디스패치 콜백
   * @param getStateHash 체크포인트 검증용 해시 계산 콜백
   * @param maxTicks 시뮬레이션 최대 틱 상한선 (기본: 마지막 액션/체크포인트 틱)
   */
  playToEnd(
    advanceTick: (tick: number) => void,
    onAction: (action: ReplayAction) => void,
    getStateHash?: () => string | number,
    maxTicks?: number,
  ): PlayResult {
    this.reset();

    const endTick =
      maxTicks ??
      Math.max(
        this.data.actions[this.data.actions.length - 1]?.tick ?? 0,
        this.data.checkpoints[this.data.checkpoints.length - 1]?.tick ?? 0,
      );

    let totalActionsExecuted = 0;
    let desynced = false;
    let desyncTick: number | undefined;

    for (let t = 0; t <= endTick; t++) {
      this._currentTick = t;
      totalActionsExecuted += this._dispatchActionsUpTo(t, onAction);
      advanceTick(t);
      const cp = this._verifyCheckpointsUpTo(t, getStateHash);

      if (cp.desynced && !desynced) {
        desynced = true;
        desyncTick = t;
      }
    }

    return {
      completed: true,
      desynced,
      finalTick: endTick,
      totalActionsExecuted,
      desyncTick,
    };
  }

  /**
   * 리플레이 재생 상태를 처음(0틱)으로 리셋합니다.
   */
  reset(): void {
    this._cursor = 0;
    this._checkpointCursor = 0;
    this._currentTick = 0;
  }
}
