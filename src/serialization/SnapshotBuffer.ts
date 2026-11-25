/**
 * @module serialization/SnapshotBuffer
 * 틱 기반 월드 스냅샷 링 버퍼 및 서버 권위 스냅샷 수신 시 클라이언트 예측 롤백·재실행(Reconciliation) 유틸리티.
 */

import { World } from '../core/World';
import { EventMap } from '../core/EventBus';
import { CoreEvents } from '../events';
import { CommandMap, CoreCommands, GameCommand } from '../simulation/CommandBus';
import { FixedStepRunner, FixedStepRunnerState } from '../simulation/FixedStepRunner';
import { WorldSerializer, SerializedWorld, defaultWorldSerializer } from './WorldSerializer';

export interface SnapshotBufferOptions {
  /** 링 버퍼 최대 보관 틱 수. 기본값: 64 */
  capacity?: number;
  /** PRNG 상태 포함 여부. 기본값: true */
  includePrngState?: boolean;
  /** 커스텀 직렬화기 (생략 시 defaultWorldSerializer) */
  serializer?: WorldSerializer;
}

export interface WorldSnapshotEntry {
  tick: number;
  hash: string;
  state: SerializedWorld;
  runnerState?: FixedStepRunnerState;
}

export interface ReconcileOptions<
  Events extends EventMap = CoreEvents,
  Commands extends CommandMap = CoreCommands,
> {
  serverTick: number;
  serverState: SerializedWorld | string;
  serverHash?: string;
  world: World<Events>;
  runner: FixedStepRunner<Events, Commands>;
  unackedCommands?: readonly GameCommand<Commands>[];
}

export interface ReconcileResult {
  matched: boolean;
  serverTick: number;
  rollbackPerformed: boolean;
  replayedCommands: number;
  replayedTicks: number;
  finalTick: number;
  finalHash: string;
}

export class SnapshotBuffer {
  readonly capacity: number;
  private readonly _includePrngState: boolean;
  private readonly _serializer: WorldSerializer;
  private _entries: Map<number, WorldSnapshotEntry> = new Map();

  constructor(options: SnapshotBufferOptions = {}) {
    this.capacity =
      Number.isFinite(options.capacity) && options.capacity! >= 1
        ? Math.floor(options.capacity!)
        : 64;
    this._includePrngState = options.includePrngState ?? true;
    this._serializer = options.serializer ?? defaultWorldSerializer;
  }

  get size(): number {
    return this._entries.size;
  }

  capture(
    tick: number,
    world: World<any>,
    runner?: FixedStepRunner<any, any>,
  ): WorldSnapshotEntry {
    const normalizedTick = Math.max(0, Math.floor(tick));
    if (this._entries.has(normalizedTick)) {
      this._entries.delete(normalizedTick);
    }

    const entry: WorldSnapshotEntry = {
      tick: normalizedTick,
      hash: world.hash({ includePrngState: this._includePrngState }),
      state: this._serializer.serialize(world, { includePrngState: this._includePrngState }),
      runnerState: runner ? runner.exportState() : undefined,
    };

    this._entries.set(normalizedTick, entry);

    while (this._entries.size > this.capacity) {
      const oldestKey = this._entries.keys().next().value;
      if (oldestKey === undefined) break;
      this._entries.delete(oldestKey);
    }

    return entry;
  }

  get(tick: number): WorldSnapshotEntry | undefined {
    return this._entries.get(Math.floor(tick));
  }

  has(tick: number): boolean {
    return this._entries.has(Math.floor(tick));
  }

  ticks(): number[] {
    return Array.from(this._entries.keys()).sort((a, b) => a - b);
  }

  getLatest(): WorldSnapshotEntry | undefined {
    const sorted = this.ticks();
    if (sorted.length === 0) return undefined;
    return this._entries.get(sorted[sorted.length - 1]);
  }

  getNearestBefore(tick: number): WorldSnapshotEntry | undefined {
    const target = Math.floor(tick);
    let best: WorldSnapshotEntry | undefined;
    for (const t of this.ticks()) {
      if (t <= target) {
        best = this._entries.get(t);
      } else {
        break;
      }
    }
    return best;
  }

  pruneBefore(minTick: number): void {
    const cutoff = Math.floor(minTick);
    for (const tick of Array.from(this._entries.keys())) {
      if (tick < cutoff) {
        this._entries.delete(tick);
      }
    }
  }

  pruneAfter(maxTick: number): void {
    const cutoff = Math.floor(maxTick);
    for (const tick of Array.from(this._entries.keys())) {
      if (tick > cutoff) {
        this._entries.delete(tick);
      }
    }
  }

  clear(): void {
    this._entries.clear();
  }

  restore(
    tick: number,
    world: World<any>,
    runner?: FixedStepRunner<any, any>,
  ): boolean {
    const entry = this.get(tick);
    if (!entry) return false;

    this._serializer.deserialize(entry.state, world, { clearWorld: true });
    if (runner) {
      if (entry.runnerState) {
        runner.importState(entry.runnerState);
      } else {
        runner.reset(entry.tick);
      }
    }
    return true;
  }

  /**
   * 서버 권위 스냅샷과 로컬 예측 스냅샷을 대조해 불일치 시 롤백 후 미확인 커맨드를 재실행한다.
   */
  reconcile<
    Events extends EventMap = CoreEvents,
    Commands extends CommandMap = CoreCommands,
  >(options: ReconcileOptions<Events, Commands>): ReconcileResult {
    const {
      serverTick,
      serverState,
      serverHash,
      world,
      runner,
      unackedCommands = [],
    } = options;

    const normalizedServerTick = Math.max(0, Math.floor(serverTick));
    const parsedServer: SerializedWorld =
      typeof serverState === 'string' ? JSON.parse(serverState) : serverState;

    const local = this.get(normalizedServerTick);
    if (local) {
      let matches = false;
      if (serverHash !== undefined) {
        matches = local.hash === serverHash;
      } else {
        const sameEntities =
          JSON.stringify(local.state.entities) === JSON.stringify(parsedServer.entities);
        const sameBlackboard =
          JSON.stringify(local.state.blackboard ?? {}) === JSON.stringify(parsedServer.blackboard ?? {});
        const samePrng =
          parsedServer.prngState === undefined ||
          local.state.prngState === undefined ||
          JSON.stringify(local.state.prngState) === JSON.stringify(parsedServer.prngState);
        matches = sameEntities && sameBlackboard && samePrng;
      }

      if (matches) {
        return {
          matched: true,
          serverTick: normalizedServerTick,
          rollbackPerformed: false,
          replayedCommands: 0,
          replayedTicks: 0,
          finalTick: runner.tick,
          finalHash: world.hash({ includePrngState: this._includePrngState }),
        };
      }
    }

    const targetTick = Math.max(runner.tick, normalizedServerTick);

    this._serializer.deserialize(parsedServer, world, { clearWorld: true });
    runner.reset(normalizedServerTick);
    this.pruneAfter(normalizedServerTick);
    this.capture(normalizedServerTick, world, runner);

    const toReplay = unackedCommands.filter(
      (cmd) => (cmd.tick ?? normalizedServerTick + 1) > normalizedServerTick,
    );

    let replayedCommands = 0;
    for (const cmd of toReplay) {
      const scheduledTick =
        cmd.tick !== undefined
          ? Math.max(normalizedServerTick + 1, Math.floor(cmd.tick))
          : normalizedServerTick + 1;
      if (scheduledTick <= targetTick) {
        replayedCommands++;
      }
      runner.commands.enqueueCommand({
        ...cmd,
        tick: scheduledTick,
      });
    }

    for (let t = normalizedServerTick + 1; t <= targetTick; t++) {
      runner.step(1);
      this.capture(runner.tick, world, runner);
    }

    return {
      matched: false,
      serverTick: normalizedServerTick,
      rollbackPerformed: true,
      replayedCommands,
      replayedTicks: Math.max(0, targetTick - normalizedServerTick),
      finalTick: runner.tick,
      finalHash: world.hash({ includePrngState: this._includePrngState }),
    };
  }
}
