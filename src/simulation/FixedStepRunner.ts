/**
 * @module simulation/FixedStepRunner
 * 고정 타임스텝(Fixed Timestep) 시뮬레이션 러너.
 * 프레임률(60Hz/120Hz/가변 델타)과 무관하게 동일한 stepMs 간격으로 커맨드 플러시와 World 틱을 실행하며,
 * 렌더러 보간 계수(alpha), 자동 리플레이 녹화 및 결정론적 재생 검증을 통합 지원한다.
 */

import { World } from '../core/World';
import { EventMap } from '../core/EventBus';
import { CoreEvents } from '../events';
import { ReplayRecorder } from '../replay/ReplayRecorder';
import { ReplayPlayer, PlayResult } from '../replay/ReplayPlayer';
import { ReplayData } from '../replay/types';
import { CommandBus, CommandMap, CoreCommands } from './CommandBus';

export interface FixedStepRunnerOptions<Commands extends CommandMap = CoreCommands> {
  /** 고정 시뮬레이션 틱 간격(ms). 기본값: 16 */
  stepMs?: number;
  /** 한 프레임(advance 호출)당 최대 실행 스텝 수 (Spiral of Death 방지). 기본값: 10 */
  maxStepsPerFrame?: number;
  /** 한 프레임에 입력될 수 있는 최대 델타 클램프(ms). 기본값: stepMs * maxStepsPerFrame */
  maxFrameDeltaMs?: number;
  /** 연결할 CommandBus 인스턴스 (생략 시 새로 생성) */
  commands?: CommandBus<Commands>;
  /** World update 모드. 기본값: 'realtime' */
  mode?: 'turn' | 'realtime';
  /** 자동 리플레이 녹화기 (선택) */
  recorder?: ReplayRecorder;
  /** 체크포인트 해시 자동 기록 주기 (틱 수, 0 이하면 비활성). 기본값: 0 */
  checkpointInterval?: number;
  /** 각 고정 틱 완료 후 호출되는 콜백 */
  onTick?: (tick: number, stepMs: number) => void;
}

export interface AdvanceResult {
  stepsExecuted: number;
  currentTick: number;
  accumulatorMs: number;
  alpha: number;
  clamped: boolean;
}

export interface FixedStepRunnerState {
  tick: number;
  accumulatorMs: number;
  stepMs: number;
}

export class FixedStepRunner<
  Events extends EventMap = CoreEvents,
  Commands extends CommandMap = CoreCommands,
> {
  readonly world: World<Events>;
  readonly commands: CommandBus<Commands>;
  readonly stepMs: number;
  readonly maxStepsPerFrame: number;
  readonly maxFrameDeltaMs: number;

  private _mode: 'turn' | 'realtime';
  private _tick = 0;
  private _accumulatorMs = 0;
  private _recorder?: ReplayRecorder;
  private _checkpointInterval = 0;
  private _onTick?: (tick: number, stepMs: number) => void;

  constructor(
    world: World<Events>,
    options: FixedStepRunnerOptions<Commands> = {},
  ) {
    this.world = world;
    this.stepMs = Number.isFinite(options.stepMs) && options.stepMs! > 0 ? options.stepMs! : 16;
    this.maxStepsPerFrame =
      Number.isFinite(options.maxStepsPerFrame) && options.maxStepsPerFrame! >= 1
        ? Math.floor(options.maxStepsPerFrame!)
        : 10;
    this.maxFrameDeltaMs =
      Number.isFinite(options.maxFrameDeltaMs) && options.maxFrameDeltaMs! > 0
        ? options.maxFrameDeltaMs!
        : this.stepMs * this.maxStepsPerFrame;
    this._mode = options.mode ?? 'realtime';
    this._onTick = options.onTick;

    this.commands = options.commands ?? new CommandBus<Commands>();
    this.commands.bindEventBus(this.world.bus);

    this._checkpointInterval = Math.max(0, Math.floor(options.checkpointInterval ?? 0));
    if (options.recorder) {
      this.setRecorder(options.recorder, this._checkpointInterval);
    }
  }

  get tick(): number {
    return this._tick;
  }

  get accumulatorMs(): number {
    return this._accumulatorMs;
  }

  /**
   * 렌더러 보간용 계수 (0.0 <= alpha <= 1.0)
   */
  get alpha(): number {
    return Math.min(1, Math.max(0, this._accumulatorMs / this.stepMs));
  }

  get elapsedMs(): number {
    return this._tick * this.stepMs;
  }

  get recorder(): ReplayRecorder | undefined {
    return this._recorder;
  }

  setRecorder(recorder?: ReplayRecorder, checkpointInterval?: number): this {
    this._recorder = recorder;
    if (checkpointInterval !== undefined && Number.isFinite(checkpointInterval)) {
      this._checkpointInterval = Math.max(0, Math.floor(checkpointInterval));
    }
    this.commands.bindRecorder(recorder);
    return this;
  }

  /**
   * 고정 틱을 정확히 `count`회 결정론적으로 실행한다.
   */
  step(count = 1): number {
    if (!Number.isFinite(count) || count <= 0) return 0;

    const steps = Math.floor(count);
    let executed = 0;

    for (let i = 0; i < steps; i++) {
      if (this.world.isPaused) break;

      this._tick += 1;
      this.commands.flush(this._tick);
      this.world.update(this.stepMs, this._mode);
      this.world.bus.emit('simulation:tick' as any, {
        tick: this._tick,
        stepMs: this.stepMs,
        elapsedMs: this.elapsedMs,
      } as any);

      this._onTick?.(this._tick, this.stepMs);

      if (this._recorder && this._checkpointInterval > 0 && this._tick % this._checkpointInterval === 0) {
        this._recorder.recordCheckpoint(this._tick, this.world.hash());
      }

      executed++;
    }

    return executed;
  }

  /**
   * 가변 프레임 델타를 누적하여 고정 `stepMs` 단위로 시뮬레이션을 진행한다.
   */
  advance(frameDeltaMs: number): AdvanceResult {
    if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0 || this.world.isPaused) {
      return {
        stepsExecuted: 0,
        currentTick: this._tick,
        accumulatorMs: this._accumulatorMs,
        alpha: this.alpha,
        clamped: false,
      };
    }

    let clamped = false;
    let delta = frameDeltaMs;
    if (delta > this.maxFrameDeltaMs) {
      delta = this.maxFrameDeltaMs;
      clamped = true;
    }

    this._accumulatorMs += delta;
    let stepsExecuted = 0;
    const EPS = 1e-9;

    while (this._accumulatorMs + EPS >= this.stepMs && stepsExecuted < this.maxStepsPerFrame) {
      if (this.world.isPaused) break;
      this._accumulatorMs = Math.max(0, this._accumulatorMs - this.stepMs);
      const ran = this.step(1);
      if (ran === 0) break;
      stepsExecuted += ran;
    }

    if (this._accumulatorMs + EPS >= this.stepMs && !this.world.isPaused) {
      this._accumulatorMs = 0;
      clamped = true;
    }

    return {
      stepsExecuted,
      currentTick: this._tick,
      accumulatorMs: this._accumulatorMs,
      alpha: this.alpha,
      clamped,
    };
  }

  /**
   * 녹화된 리플레이 데이터를 CommandBus 경유로 재생하고 선택적으로 체크포인트 해시를 검증한다.
   * 호출 전에 World를 초기 시드/초기 엔티티 상태로 준비해 두어야 한다.
   */
  replay(
    replayData: ReplayData | string,
    options?: { verifyCheckpoints?: boolean; maxTicks?: number },
  ): PlayResult {
    const player = new ReplayPlayer(replayData);
    const prevRecorder = this._recorder;
    const verify = options?.verifyCheckpoints ?? true;

    this._recorder = undefined;
    this.commands.bindRecorder(undefined);
    this._tick = 0;
    this._accumulatorMs = 0;
    this.commands.clearQueue();

    try {
      return player.playToEnd(
        (t) => {
          if (t === 0) return;
          this._tick = t;
          this.world.update(this.stepMs, this._mode);
          this.world.bus.emit('simulation:tick' as any, {
            tick: this._tick,
            stepMs: this.stepMs,
            elapsedMs: this.elapsedMs,
          } as any);
          this._onTick?.(this._tick, this.stepMs);
        },
        (action) => {
          this.commands.dispatch(action.actionType as keyof Commands, action.payload, {
            tick: action.tick,
          });
        },
        verify ? () => this.world.hash() : undefined,
        options?.maxTicks,
      );
    } finally {
      this._recorder = prevRecorder;
      this.commands.bindRecorder(prevRecorder);
    }
  }

  reset(initialTick = 0): void {
    this._tick = Number.isFinite(initialTick) ? Math.max(0, Math.floor(initialTick)) : 0;
    this._accumulatorMs = 0;
    this.commands.clearQueue();
  }

  exportState(): FixedStepRunnerState {
    return {
      tick: this._tick,
      accumulatorMs: this._accumulatorMs,
      stepMs: this.stepMs,
    };
  }

  importState(state: FixedStepRunnerState): void {
    if (!state || typeof state !== 'object') return;
    if (Number.isFinite(state.tick)) {
      this._tick = Math.max(0, Math.floor(state.tick));
    }
    if (Number.isFinite(state.accumulatorMs)) {
      this._accumulatorMs = Math.max(0, state.accumulatorMs);
    }
  }
}
