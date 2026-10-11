/**
 * @module status/StatusReactionEngine
 * 상태이상(StatusEffect) 간의 원소/화학적 상호작용(Elemental Reaction) 및 중첩 규칙 엔진.
 *
 * 예시:
 * - 'fire' + 'oil' => 'explosion' (대폭발 보너스 피해 및 화염 소모)
 * - 'wet' + 'frost' => 'frozen' (행동 불능 상태이상 전환)
 * - 'water' + 'lightning' => 'electrocuted' (광역 감전 연계)
 */

import { Entity } from '../core/Entity';
import { StatusInstance } from '../components/StatusEffectsComponent';
import { EventBus } from '../core/EventBus';

export type ReactionConsumeMode = 'both' | 'primary' | 'secondary' | 'none';

export interface StatusReactionRule {
  /** 반응 고유 식별자 (예: 'combustion', 'freeze', 'electrocute') */
  name: string;
  /** 상호작용할 두 상태이상 ID 쌍 (순서 무관하게 매칭) */
  statuses: [string, string];
  /** 반응 후 기존 상태이상 소모 방식 (기본: 'both') */
  consume?: ReactionConsumeMode;
  /** 반응 결과 새로 부여할 상태이상 (선택적) */
  resultStatus?: {
    id: string;
    duration: number;
    stacks?: number;
    maxStacks?: number;
    tickDamage?: number;
  };
  /** 반응으로 즉시 가해지는 추가 피해 */
  bonusDamage?: number;
  /** 연출 큐 이름 (예: 'vfx:combustion') */
  cueEffect?: string;
  /** 커스텀 반응 로직 콜백 */
  onReaction?: (
    entity: Entity,
    statusA: StatusInstance,
    statusB: StatusInstance,
    context: { bus: EventBus<any>; emitCue?: (cue: string) => void },
  ) => void;
}

export interface StatusReactionResult {
  rule: StatusReactionRule;
  targetEntityId: number;
  consumedStatuses: string[];
  appliedStatusId?: string;
  damageDealt?: number;
}

export class StatusReactionRegistry {
  private _rules: StatusReactionRule[] = [];

  /**
   * 새로운 원소/상태 반응 규칙을 등록합니다.
   */
  register(rule: StatusReactionRule): this {
    this._rules.push(rule);
    return this;
  }

  /**
   * 등록된 모든 규칙 반환
   */
  get rules(): readonly StatusReactionRule[] {
    return this._rules;
  }

  /**
   * 새로 부여되는 statusId와 기존에 엔티티가 가진 statusIds 간에 매칭되는 반응 규칙을 찾습니다.
   */
  findMatchingRule(
    newStatusId: string,
    existingStatusIds: string[],
  ): { rule: StatusReactionRule; existingStatusId: string } | undefined {
    for (const rule of this._rules) {
      const [s1, s2] = rule.statuses;
      if (newStatusId === s1 && existingStatusIds.includes(s2)) {
        return { rule, existingStatusId: s2 };
      }
      if (newStatusId === s2 && existingStatusIds.includes(s1)) {
        return { rule, existingStatusId: s1 };
      }
    }
    return undefined;
  }
}
