/**
 * @module core/TimerScheduler
 * 시간(ms) 또는 턴(turn) 기반 지연 실행 및 주기 반복 액션을 관리하는 초경량 스케줄러.
 * World.update() 루프와 일원화되어 프레임/턴 단위로 정확하게 실행된다.
 */

export type TaskScheduleMode = 'time' | 'turn' | 'realtime';

export interface ScheduledTask {
  id: number;
  cancel: () => void;
  (): void;
}

export interface TimerTask {
  id: number;
  remaining: number;
  interval?: number;
  repeat: boolean;
  timesRemaining?: number;
  callback: () => void;
  isTurnBased: boolean;
}

export class TimerScheduler {
  private static _nextId = 1;
  private _tasks: Map<number, TimerTask> = new Map();

  private _createHandle(id: number): ScheduledTask {
    const cancelFn = () => this.cancel(id);
    const handle = cancelFn as unknown as ScheduledTask;
    handle.id = id;
    handle.cancel = cancelFn;
    return handle;
  }

  /**
   * 지정된 시간(ms) 경과 후 1회 실행되는 단발성 타이머 예약
   * @param delayMs 지연 시간 (ms)
   * @param callback 실행할 콜백 함수
   */
  schedule(delayMs: number, callback: () => void): ScheduledTask {
    const id = TimerScheduler._nextId++;
    const safeDelay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
    this._tasks.set(id, {
      id,
      remaining: safeDelay,
      repeat: false,
      callback,
      isTurnBased: false,
    });
    return this._createHandle(id);
  }

  /**
   * 지정된 간격(ms)마다 주기적으로 반복 실행되는 타이머 예약
   * @param intervalMs 반복 간격 (ms)
   * @param callback 실행할 콜백 함수
   * @param times 반복 실행할 최대 횟수 (지정하지 않으면 무제한)
   */
  scheduleEvery(intervalMs: number, callback: () => void, times?: number): ScheduledTask {
    const id = TimerScheduler._nextId++;
    if (times !== undefined && (!Number.isFinite(times) || times <= 0)) {
      return this._createHandle(id);
    }
    const safeInterval = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 1e-6;
    this._tasks.set(id, {
      id,
      remaining: safeInterval,
      interval: safeInterval,
      repeat: true,
      timesRemaining: times !== undefined ? Math.floor(times) : undefined,
      callback,
      isTurnBased: false,
    });
    return this._createHandle(id);
  }

  /**
   * 지정된 턴(Turn) 수 경과 후 실행되는 턴제 전용 타이머 예약
   * @param turns 지연 턴 수
   * @param callback 실행할 콜백 함수
   */
  scheduleTurns(turns: number, callback: () => void): ScheduledTask {
    const id = TimerScheduler._nextId++;
    const safeTurns = Number.isFinite(turns) ? Math.max(0, turns) : 0;
    this._tasks.set(id, {
      id,
      remaining: safeTurns,
      repeat: false,
      callback,
      isTurnBased: true,
    });
    return this._createHandle(id);
  }

  /**
   * 지정된 턴(Turn) 주기마다 반복 실행되는 턴제 전용 타이머 예약
   * @param intervalTurns 반복 턴 간격
   * @param callback 실행할 콜백 함수
   * @param times 반복 실행할 최대 횟수 (지정하지 않으면 무제한)
   */
  scheduleTurnsEvery(intervalTurns: number, callback: () => void, times?: number): ScheduledTask {
    const id = TimerScheduler._nextId++;
    if (times !== undefined && (!Number.isFinite(times) || times <= 0)) {
      return this._createHandle(id);
    }
    const safeInterval = Number.isFinite(intervalTurns) && intervalTurns > 0 ? intervalTurns : 1e-6;
    this._tasks.set(id, {
      id,
      remaining: safeInterval,
      interval: safeInterval,
      repeat: true,
      timesRemaining: times !== undefined ? Math.floor(times) : undefined,
      callback,
      isTurnBased: true,
    });
    return this._createHandle(id);
  }

  /**
   * 특정 타이머 예약 취소
   */
  cancel(id: number): boolean {
    return this._tasks.delete(id);
  }

  /**
   * 모든 활성 타이머 제거
   */
  clear(): void {
    this._tasks.clear();
  }

  get activeCount(): number {
    return this._tasks.size;
  }

  /**
   * World.update() 호출 시 틱 갱신
   */
  update(delta: number, mode: TaskScheduleMode = 'realtime'): void {
    if (this._tasks.size === 0 || !Number.isFinite(delta) || delta <= 0) return;

    const isTurn = mode === 'turn';
    const tasksToProcess = Array.from(this._tasks.values());

    for (const task of tasksToProcess) {
      // 삭제된 작업 스킵
      if (!this._tasks.has(task.id)) continue;
      if (task.isTurnBased !== isTurn) continue;

      if (!task.repeat) {
        task.remaining -= delta;
        if (task.remaining <= 0) {
          this._tasks.delete(task.id);
          try {
            task.callback();
          } catch (err) {
            console.error('[TimerScheduler] Unhandled error in scheduled task:', err);
          }
        }
      } else {
        const interval = task.interval ?? 1;
        let elapsed = delta;

        while (elapsed > 0 && this._tasks.has(task.id)) {
          if (elapsed >= task.remaining) {
            elapsed -= task.remaining;
            task.remaining = interval;

            if (task.timesRemaining !== undefined) {
              task.timesRemaining--;
              if (task.timesRemaining <= 0) {
                this._tasks.delete(task.id);
              }
            }

            try {
              task.callback();
            } catch (err) {
              console.error('[TimerScheduler] Unhandled error in repeating task:', err);
            }
          } else {
            task.remaining -= elapsed;
            elapsed = 0;
          }
        }
      }
    }
  }
}
