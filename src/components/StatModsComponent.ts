/**
 * @module components/StatModsComponent
 * Entity에 적용된 임시 스탯 변화(버프/디버프) 목록을 관리한다.
 *
 * 스탯 최종값은 StatsComponent의 기본값에 이 목록을 합산해 계산한다.
 * StatModSystem이 매 틱 만료를 체크하고, 만료된 모드를 제거한다.
 *
 * @example
 * // 공격력 +20, 3초간 (소스: skill 'rage')
 * const mods = entity.get(StatModsComponent);
 * mods?.add({ sourceId: 'rage', stat: 'attack', flat: 20, duration: 3000 });
 *
 * // 최종 공격력 조회
 * const finalAttack = entity.get(StatModsComponent)?.compute('attack', baseAttack) ?? baseAttack;
 */

import { Component } from '../core/Component';

export type ModifiableStat =
  | 'attack'
  | 'defense'
  | 'speed'
  | 'maxHp'
  | 'maxMp'
  | string; // 커스텀 스탯 확장 가능

export interface StatModifier {
  /** 변화의 고유 ID (같은 sourceId면 덮어쓰기) */
  sourceId: string;
  /** 대상 스탯 */
  stat: ModifiableStat;
  /** 절대값 변화량 (양수=버프, 음수=디버프) */
  flat?: number;
  /** 배율 변화 (0.2 = +20%, -0.1 = -10%) */
  percent?: number;
  /** 잔여 지속 시간 ms (undefined = 영구) */
  remainingDuration?: number;
  /** 최대 중첩 수 (기본 1, 같은 sourceId가 중첩될 때) */
  maxStacks?: number;
  /** 현재 중첩 수 */
  stacks?: number;
  /** 부여한 entity ID */
  sourceEntityId?: number;
}

export class StatModsComponent extends Component {
  private _mods: Map<string, StatModifier> = new Map();

  // ──────────────────────────────────────────────
  // 추가 / 제거
  // ──────────────────────────────────────────────

  /**
   * 스탯 변화를 추가한다.
   * 같은 sourceId가 이미 존재하면 duration을 갱신하고 스택을 추가한다.
   */
  add(mod: StatModifier): void {
    const existing = this._mods.get(mod.sourceId);
    if (existing && existing.stat === mod.stat) {
      // duration 갱신 (더 긴 쪽 유지)
      if (mod.remainingDuration !== undefined && existing.remainingDuration !== undefined) {
        existing.remainingDuration = Math.max(existing.remainingDuration, mod.remainingDuration);
      } else if (mod.remainingDuration !== undefined) {
        existing.remainingDuration = mod.remainingDuration;
      }
      // 스택 추가
      const maxStacks = mod.maxStacks ?? 1;
      existing.stacks = Math.min((existing.stacks ?? 1) + 1, maxStacks);
    } else {
      this._mods.set(mod.sourceId, { stacks: 1, ...mod });
    }
  }

  remove(sourceId: string): boolean {
    return this._mods.delete(sourceId);
  }

  has(sourceId: string): boolean {
    return this._mods.has(sourceId);
  }

  get all(): StatModifier[] {
    return [...this._mods.values()];
  }

  /** 특정 스탯에 적용된 변화만 반환 */
  forStat(stat: ModifiableStat): StatModifier[] {
    return this.all.filter((m) => m.stat === stat);
  }

  // ──────────────────────────────────────────────
  // 최종값 계산
  // ──────────────────────────────────────────────

  /**
   * 기본값(base)에 이 스탯의 모든 활성 변화를 적용한 최종값을 반환한다.
   * 적용 순서: base → flat 합산 → percent 배율 적용
   */
  compute(stat: ModifiableStat, base: number): number {
    const mods = this.forStat(stat);
    if (mods.length === 0) return base;

    let flatSum = 0;
    let percentSum = 0;

    for (const mod of mods) {
      const stacks = mod.stacks ?? 1;
      flatSum += (mod.flat ?? 0) * stacks;
      percentSum += (mod.percent ?? 0) * stacks;
    }

    return Math.round((base + flatSum) * (1 + percentSum));
  }

  // ──────────────────────────────────────────────
  // @internal — StatModSystem만 호출
  // ──────────────────────────────────────────────

  /**
   * 틱마다 duration을 감소시키고 만료된 변화의 sourceId 목록을 반환한다.
   */
  _tick(delta: number): Array<{ sourceId: string; stat: ModifiableStat }> {
    const expired: Array<{ sourceId: string; stat: ModifiableStat }> = [];
    for (const [id, mod] of this._mods) {
      if (mod.remainingDuration === undefined) continue; // 영구 효과
      mod.remainingDuration -= delta;
      if (mod.remainingDuration <= 0) {
        expired.push({ sourceId: id, stat: mod.stat });
        this._mods.delete(id);
      }
    }
    return expired;
  }
}
