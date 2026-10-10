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
  'entity:spawned': { entityId: number; blueprintId: string; tags: string[] };
  'entity:removed': { entityId: number };

  // ─── 스탯 변화 ────────────────────────────────
  'stats:hp:changed': { entityId: number; prev: number; next: number; delta: number };
  'stats:died': { entityId: number };
  'stats:revived': { entityId: number };

  // ─── 인벤토리 ─────────────────────────────────
  'inventory:item:added': { entityId: number; defId: string | number; quantity: number };
  'inventory:item:removed': { entityId: number; defId: string | number; quantity: number };
  'inventory:full': { entityId: number };

  // ─── 장비 ─────────────────────────────────────
  'equipment:equipped': { entityId: number; slot: string; itemId: string | number };
  'equipment:unequipped': { entityId: number; slot: string; itemId: string | number };
  'equipment:failed': {
    entityId: number;
    slot: string;
    itemId: string | number;
    reason: 'not_in_inventory' | 'invalid_item' | 'constraint_failed' | 'inventory_full' | string;
    details?: string;
  };

  // ─── 전투 ─────────────────────────────────────
  'combat:damage': {
    attackerId: number;
    targetId: number;
    raw: number;
    effective: number;
    isCritical: boolean;
    damageType?: string;
    shieldAbsorbed?: number;
  };
  'combat:miss': { attackerId: number; targetId: number; reason?: 'evaded' | 'accuracy' | string };
  'combat:lifesteal': { attackerId: number; targetId: number; amount: number };
  'combat:reflected': { attackerId: number; targetId: number; amount: number };

  // ─── 배리어 / 쉴드 ─────────────────────────────
  'barrier:absorbed': { entityId: number; amount: number; remainingBarrier: number };
  'barrier:broken': { entityId: number };

  // ─── 스탯 변화 (버프/디버프) ──────────────────
  'stat_mod:added': {
    entityId: number;
    sourceId: string;
    stat: string;
    flat?: number;
    percent?: number;
    amplification?: number;
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
  'status:tick:damage': {
    entityId: number;
    statusId: string;
    damage: number;
    sourceEntityId?: number;
  };

  // ─── 성장 및 경험치 ─────────────────────────
  'progression:exp_gained': {
    entityId: number;
    amount: number;
    currentExp: number;
    requiredExp: number;
    level: number;
  };
  'progression:levelup': {
    entityId: number;
    oldLevel: number;
    newLevel: number;
    levelsGained: number;
    statsGained: Record<string, number>;
  };

  // ─── 전리품 및 드랍 ───────────────────────────
  'loot:dropped': {
    deadEntityId: number;
    receiverId?: number;
    items: Array<{ itemId: string | number; quantity: number }>;
    exp: number;
  };

  // ─── 턴 및 라운드 ─────────────────────────────
  'turn:round:started': { round: number; turnOrder: number[] };
  'turn:started': { round: number; entityId: number; turnIndex: number };
  'turn:ended': { round: number; entityId: number };
  'turn:round:ended': { round: number };

  // ─── 공간 및 이동 ─────────────────────────────
  'movement:moved': { entityId: number; fromX: number; fromY: number; toX: number; toY: number };
  'movement:blocked': {
    entityId: number;
    fromX: number;
    fromY: number;
    targetX: number;
    targetY: number;
    reason: 'out_of_bounds' | 'tile_blocked' | 'entity_blocked' | string;
  };
}
