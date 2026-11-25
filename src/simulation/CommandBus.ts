/**
 * @module simulation/CommandBus
 * 결정론적 게임 입력/액션을 단일 파이프라인으로 라우팅·검증·녹화하는 통합 커맨드 버스.
 * 0-Dependency 순수 TS.
 */

import { EventBus } from '../core/EventBus';
import { ReplayRecorder } from '../replay/ReplayRecorder';
import type { AttackRequest } from '../combat/CombatPipeline';
import type { UseSkillRequest } from '../systems/SkillSystem';
import type { MoveRequest } from '../spatial/MovementSystem';
import type { EquipRequest, UnequipRequest } from '../systems/EquipmentSystem';

export type CommandMap = Record<string, any>;

/**
 * GameCore 기본 내장 커맨드 맵.
 * 프로젝트별 커스텀 커맨드 확장이 필요하면 `interface MyCommands extends CoreCommands { ... }` 형태로 확장한다.
 */
export interface CoreCommands extends CommandMap {
  'combat:attack': AttackRequest;
  'skill:use': UseSkillRequest;
  'movement:move': MoveRequest;
  'equipment:equip': EquipRequest;
  'equipment:unequip': UnequipRequest;
  'inventory:add': { entityId: number; itemId: string | number; quantity?: number };
  'inventory:remove': { entityId: number; itemId: string | number; quantity?: number };
  'fsm:transition': { entityId: number; nextState: string; force?: boolean };
  'turn:end': { entityId: number };
}

export interface GameCommand<
  Commands extends CommandMap = CoreCommands,
  K extends keyof Commands = keyof Commands,
> {
  type: K;
  payload: Commands[K];
  actorId?: string | number;
  tick?: number;
}

export type CommandValidationResult = boolean | { ok: boolean; reason?: string };

export type CommandValidator<T = any> = (
  payload: T,
  command: GameCommand<any, any>,
) => CommandValidationResult;

export type CommandHandler<T = any> = (
  payload: T,
  command: GameCommand<any, any>,
) => void;

export type CommandMiddleware<Commands extends CommandMap = CoreCommands> = (
  command: GameCommand<Commands>,
) => CommandValidationResult;

export interface CommandDispatchResult {
  ok: boolean;
  type: string;
  tick: number;
  reason?: string;
  error?: unknown;
}

export type CommandHook = (result: CommandDispatchResult, command: GameCommand<any, any>) => void;

interface RegisteredCommandEntry<T = any> {
  handler: CommandHandler<T>;
  validator?: CommandValidator<T>;
}

function safeClone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function normalizeValidation(res: CommandValidationResult, fallbackReason: string): { ok: boolean; reason?: string } {
  if (typeof res === 'boolean') {
    return res ? { ok: true } : { ok: false, reason: fallbackReason };
  }
  if (res.ok) return { ok: true };
  return { ok: false, reason: res.reason ?? fallbackReason };
}

export class CommandBus<Commands extends CommandMap = CoreCommands> {
  private _handlers: Map<keyof Commands, RegisteredCommandEntry<any>> = new Map();
  private _middlewares: CommandMiddleware<Commands>[] = [];
  private _queue: GameCommand<Commands>[] = [];
  private _hooks: Set<CommandHook> = new Set();
  private _bus?: EventBus<any>;
  private _recorder?: ReplayRecorder;

  bindEventBus(bus?: EventBus<any>): this {
    this._bus = bus;
    return this;
  }

  bindRecorder(recorder?: ReplayRecorder): this {
    this._recorder = recorder;
    return this;
  }

  register<K extends keyof Commands>(
    type: K,
    handler: CommandHandler<Commands[K]>,
    validator?: CommandValidator<Commands[K]>,
  ): this {
    this._handlers.set(type, { handler, validator });
    return this;
  }

  unregister<K extends keyof Commands>(type: K): this {
    this._handlers.delete(type);
    return this;
  }

  hasHandler<K extends keyof Commands>(type: K): boolean {
    return this._handlers.has(type);
  }

  addMiddleware(middleware: CommandMiddleware<Commands>): () => void {
    this._middlewares.push(middleware);
    return () => {
      const idx = this._middlewares.indexOf(middleware);
      if (idx !== -1) this._middlewares.splice(idx, 1);
    };
  }

  onDispatched(hook: CommandHook): () => void {
    this._hooks.add(hook);
    return () => {
      this._hooks.delete(hook);
    };
  }

  enqueue<K extends keyof Commands>(
    type: K,
    payload: Commands[K],
    options?: { actorId?: string | number; tick?: number },
  ): this {
    const tick = options?.tick !== undefined && Number.isFinite(options.tick)
      ? Math.max(0, Math.floor(options.tick))
      : undefined;

    this._queue.push({
      type,
      payload: safeClone(payload),
      actorId: options?.actorId,
      tick,
    });
    return this;
  }

  enqueueCommand(command: GameCommand<Commands>): this {
    return this.enqueue(command.type, command.payload, {
      actorId: command.actorId,
      tick: command.tick,
    });
  }

  get pendingCount(): number {
    return this._queue.length;
  }

  peekQueue(): readonly GameCommand<Commands>[] {
    return [...this._queue];
  }

  clearQueue(): void {
    this._queue = [];
  }

  clear(): void {
    this._handlers.clear();
    this._middlewares = [];
    this._queue = [];
    this._hooks.clear();
  }

  dispatch<K extends keyof Commands>(
    type: K,
    payload: Commands[K],
    options?: { actorId?: string | number; tick?: number },
  ): CommandDispatchResult {
    const tick = options?.tick !== undefined && Number.isFinite(options.tick)
      ? Math.max(0, Math.floor(options.tick))
      : 0;

    const command: GameCommand<Commands, K> = {
      type,
      payload: safeClone(payload),
      actorId: options?.actorId,
      tick,
    };

    const typeName = String(type);
    const entry = this._handlers.get(type);
    if (!entry) {
      return this._reject(command, `No handler registered for command '${typeName}'`);
    }

    for (const mw of [...this._middlewares]) {
      try {
        const res = normalizeValidation(mw(command), `Command '${typeName}' rejected by middleware`);
        if (!res.ok) {
          return this._reject(command, res.reason!);
        }
      } catch (err: any) {
        return this._reject(command, err?.message ?? String(err), err);
      }
    }

    if (entry.validator) {
      try {
        const res = normalizeValidation(
          entry.validator(command.payload, command),
          `Command '${typeName}' failed validation`,
        );
        if (!res.ok) {
          return this._reject(command, res.reason!);
        }
      } catch (err: any) {
        return this._reject(command, err?.message ?? String(err), err);
      }
    }

    try {
      entry.handler(command.payload, command);
    } catch (err: any) {
      return this._reject(command, err?.message ?? String(err), err);
    }

    if (this._recorder) {
      this._recorder.recordAction(tick, typeName, command.payload);
    }

    const result: CommandDispatchResult = {
      ok: true,
      type: typeName,
      tick,
    };

    if (this._bus) {
      this._bus.emit('command:dispatched', {
        type: typeName,
        payload: command.payload,
        actorId: command.actorId,
        tick,
      });
    }

    this._notifyHooks(result, command);
    return result;
  }

  flush(currentTick?: number): CommandDispatchResult[] {
    if (this._queue.length === 0) return [];

    const results: CommandDispatchResult[] = [];
    if (currentTick === undefined || !Number.isFinite(currentTick)) {
      const due = this._queue;
      this._queue = [];
      for (const cmd of due) {
        results.push(
          this.dispatch(cmd.type, cmd.payload, {
            actorId: cmd.actorId,
            tick: cmd.tick ?? 0,
          }),
        );
      }
      return results;
    }

    const normalizedTick = Math.max(0, Math.floor(currentTick));
    const due: GameCommand<Commands>[] = [];
    const deferred: GameCommand<Commands>[] = [];

    for (const cmd of this._queue) {
      if (cmd.tick === undefined || cmd.tick <= normalizedTick) {
        due.push(cmd);
      } else {
        deferred.push(cmd);
      }
    }

    this._queue = deferred;

    for (const cmd of due) {
      results.push(
        this.dispatch(cmd.type, cmd.payload, {
          actorId: cmd.actorId,
          tick: normalizedTick,
        }),
      );
    }

    return results;
  }

  private _reject(
    command: GameCommand<Commands>,
    reason: string,
    error?: unknown,
  ): CommandDispatchResult {
    const typeName = String(command.type);
    const tick = command.tick ?? 0;

    const result: CommandDispatchResult = {
      ok: false,
      type: typeName,
      tick,
      reason,
      ...(error !== undefined ? { error } : {}),
    };

    if (this._bus) {
      this._bus.emit('command:rejected', {
        type: typeName,
        payload: command.payload,
        actorId: command.actorId,
        tick,
        reason,
      });
    }

    this._notifyHooks(result, command);
    return result;
  }

  private _notifyHooks(result: CommandDispatchResult, command: GameCommand<Commands>): void {
    if (this._hooks.size === 0) return;
    for (const hook of Array.from(this._hooks)) {
      try {
        hook(result, command);
      } catch (err) {
        console.error('[CommandBus] Unhandled error in dispatch hook:', err);
      }
    }
  }
}
