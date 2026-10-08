/**
 * @module components/StatusEffectsComponent
 * Entity에 부여된 버프/디버프 등 지속 상태이상을 관리.
 * 각 상태이상은 스택을 가질 수 있고 duration이 0이 되면 자동 제거된다.
 */

import { Component } from '../core/Component';

export interface StatusInstance {
  /** 상태이상 식별자 (예: 'burn', 'poison', 'haste') */
  id: string;
  /** 잔여 지속 시간 ms */
  remainingDuration: number;
  /** 현재 스택 수 */
  stacks: number;
  /** 최대 스택 수 (기본 1) */
  maxStacks: number;
  /** 부여한 entity ID */
  sourceEntityId: number;
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
  ): void {
    if (this._statuses.has(id)) {
      const existing = this._statuses.get(id)!;
      // 기존 상태이상이 있으면 duration 갱신 + 스택 추가
      existing.remainingDuration = Math.max(existing.remainingDuration, duration);
      existing.stacks = Math.min(existing.stacks + stacks, maxStacks);
    } else {
      this._statuses.set(id, {
        id,
        remainingDuration: duration,
        stacks: Math.min(stacks, maxStacks),
        maxStacks,
        sourceEntityId,
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
        expired.push(id);
        this._statuses.delete(id);
      }
    }
    return expired;
  }
}
