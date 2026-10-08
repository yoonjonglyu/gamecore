/**
 * @module events
 * GameCore에서 사용하는 표준 이벤트 타입 정의.
 * 게임마다 이 타입을 확장해서 사용한다.
 *
 * @example
 * // 게임별 커스텀 이벤트 확장
 * interface MyGameEvents extends CoreEvents {
 *   'quest:completed': { questId: number };
 * }
 */

export interface CoreEvents {
  // ─── Entity 생명주기 ───────────────────────────
  'entity:created': { entityId: number; tags: string[] };
  'entity:removed': { entityId: number };

  // ─── 스탯 변화 ────────────────────────────────
  'stats:hp:changed': { entityId: number; prev: number; next: number; delta: number };
  'stats:died': { entityId: number };
  'stats:revived': { entityId: number };

  // ─── 인벤토리 ─────────────────────────────────
  'inventory:item:added': { entityId: number; defId: number; quantity: number };
  'inventory:item:removed': { entityId: number; defId: number; quantity: number };
  'inventory:full': { entityId: number };

  // ─── 전투 ─────────────────────────────────────
  'combat:damage': {
    attackerId: number;
    targetId: number;
    raw: number;
    effective: number;
    isCritical: boolean;
  };
  'combat:miss': { attackerId: number; targetId: number };

  // ─── 스탯 변화 (버프/디버프) ──────────────────
  'stat_mod:added': {
    entityId: number;
    sourceId: string;
    stat: string;
    flat?: number;
    percent?: number;
    remainingDuration?: number;
  };
  'stat_mod:expired': { entityId: number; sourceId: string; stat: string };
  'stat_mod:removed': { entityId: number; sourceId: string; stat: string };

  // ─── 스킬 ─────────────────────────────────────
  'skill:used': { casterId: number; skillId: string; targetIds: number[] };
  'skill:failed': {
    casterId: number;
    skillId: string;
    reason: 'no_skill' | 'cooldown' | 'no_mp' | 'dead' | 'no_target' | 'constraint';
    /** constraint 실패 시 상세 메시지 */
    constraintReason?: string;
  };
  'skill:cooldown:ready': { entityId: number; skillId: string };

  // ─── 상태이상 ──────────────────────────────────
  'status:applied': {
    entityId: number;
    statusId: string;
    duration: number;
    stacks: number;
    sourceEntityId: number;
  };
  'status:removed': { entityId: number; statusId: string };
  'status:expired': { entityId: number; statusId: string };
}
