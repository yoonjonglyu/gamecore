/**
 * @module components/StatusEffectsComponent
 * Entity에 부여된 버프/디버프 등 지속 상태이상을 관리.
 * 각 상태이상은 스택을 가질 수 있고 duration이 0이 되면 자동 제거된다.
 */

import { Component } from '../core/Component';

export type StackBehavior = 'refresh' | 'decay' | 'overflow_trigger';

export interface StatusInstance {
  /** 상태이상 식별자 (예: 'burn', 'poison', 'haste') */
  id: string;
  /** 잔여 지속 시간 ms 또는 turns */
  remainingDuration: number;
  /** 초기 기준 지속 시간 (decay 리셋용) */
  initialDuration?: number;
  /** 현재 스택 수 */
  stacks: number;
  /** 최대 스택 수 (기본 1) */
  maxStacks: number;
  /** 스택 초과 및 만료 시 동작 정책 (기본: 'refresh') */
  stackBehavior?: StackBehavior;
  /** 부여한 entity ID */
  sourceEntityId: number;
  /** 도트 틱 간격 (ms 또는 turns, 없으면 틱 데미지 없음) */
  tickInterval?: number;
  /** 마지막 틱 이후 경과 시간 */
  tickTime?: number;
  /** 틱당 도트 피해량 (스택 곱연산 가능) */
  tickDamage?: number;
  /** 만료 시 자동 제거할 StatModsComponent의 modifier sourceId 목록 */
  linkedModSourceIds?: string[];
}


export class StatusEffectsComponent extends Component {
  private _statuses: Map<string, StatusInstance> = new Map();

  // ──────────────────────────────────────────────
  // 상태이상 조작
  // ──────────────────────────────────────────────

  apply(
    id: string,
    duration: number,
    sourceEntityId: number,
    stacks = 1,
    maxStacks = 1,
    options?: {
      tickInterval?: number;
      tickDamage?: number;
      linkedModSourceIds?: string[];
      stackBehavior?: StackBehavior;
    },
  ): void {
    const stackBehavior = options?.stackBehavior ?? 'refresh';

    if (this._statuses.has(id)) {
      const existing = this._statuses.get(id)!;
      // 기존 상태이상이 있으면 duration 갱신 + 스택 추가
      existing.remainingDuration = Math.max(existing.remainingDuration, duration);
      existing.initialDuration = duration;
      existing.stacks = Math.min(existing.stacks + stacks, maxStacks);
      existing.stackBehavior = stackBehavior;
      if (options?.tickDamage !== undefined) existing.tickDamage = options.tickDamage;
      if (options?.tickInterval !== undefined) existing.tickInterval = options.tickInterval;
      if (options?.linkedModSourceIds) {
        existing.linkedModSourceIds = Array.from(
          new Set([...(existing.linkedModSourceIds ?? []), ...options.linkedModSourceIds]),
        );
      }
    } else {
      this._statuses.set(id, {
        id,
        remainingDuration: duration,
        initialDuration: duration,
        stacks: Math.min(stacks, maxStacks),
        maxStacks,
        stackBehavior,
        sourceEntityId,
        tickInterval: options?.tickInterval,
        tickTime: 0,
        tickDamage: options?.tickDamage,
        linkedModSourceIds: options?.linkedModSourceIds ? [...options.linkedModSourceIds] : undefined,
      });
    }
  }


  remove(id: string): boolean {
    return this._statuses.delete(id);
  }

  has(id: string): boolean {
    return this._statuses.has(id);
  }

  get(id: string): StatusInstance | undefined {
    return this._statuses.get(id);
  }

  get all(): StatusInstance[] {
    return [...this._statuses.values()];
  }

  // ──────────────────────────────────────────────
  // @internal — StatusSystem / SkillSystem만 호출
  // ──────────────────────────────────────────────

  /** 틱마다 duration을 감소시키고 만료된 상태이상 ID 목록을 반환 */
  _tick(delta: number): string[] {
    const expired: string[] = [];
    for (const [id, status] of this._statuses) {
      status.remainingDuration -= delta;
      if (status.remainingDuration <= 0) {
        if (status.stackBehavior === 'decay' && status.stacks > 1) {
          status.stacks -= 1;
          status.remainingDuration = status.initialDuration ?? 1000;
        } else {
          expired.push(id);
          this._statuses.delete(id);
        }
      }
    }
    return expired;
  }
}
