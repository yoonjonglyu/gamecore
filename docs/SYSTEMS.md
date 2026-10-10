# GameCore Built-in Systems Reference

GameCore가 기본 제공하는 표준 시스템들의 역할, 처리 프로세스, 입력 요청 및 발행 이벤트 명세입니다.

---

## 1. CombatSystem (전략형 플러거블 전투 파이프라인)
* **역할**: 전략 패턴(`DamageCalculator`)과 4단계 라이프사이클 미들웨어(`onPreHit`, `onDamageCalculate`, `onShieldAbsorb`, `onPostHit`)를 통해 전투 판정을 유연하게 처리합니다.
* **필요 컴포넌트**: `StatsComponent` 또는 `ExtendedStatsComponent` (선택적: `BarrierComponent`, `StatModsComponent`)
* **핵심 API**:
  * `combat.requestAttack({ attackerId, targetId, damageType?, armorPen?, lifesteal?, reflected?, critChance?, critMultiplier? })`
  * `combat.setCalculator(calculator: DamageCalculator)`
  * `combat.use(middleware: CombatMiddleware)`
* **발행 이벤트**:
  * `'combat:damage'`: `{ attackerId, targetId, raw, effective, isCritical, damageType, shieldAbsorbed }`
  * `'combat:miss'`: `{ attackerId, targetId, reason }`
  * `'combat:lifesteal'`: `{ attackerId, targetId, amount }`
  * `'combat:reflected'`: `{ attackerId, targetId, amount }`
  * `'barrier:absorbed'`: `{ entityId, amount, remainingBarrier }`
  * `'barrier:broken'`: `{ entityId }`
  * `'stats:hp:changed'`: `{ entityId, prev, next, delta }`
  * `'stats:died'`: `{ entityId }`

---

## 2. SkillSystem (선언적 스킬 파이프라인)
* **역할**: 스킬 사용 요청 시 쿨다운, MP 코스트, 제약조건(`ConstraintChecker`)을 검증하고, `SkillEffectExecutor`를 통해 Damage, Heal, Status, StatMod 및 커스텀 효과를 선언적으로 디스패치합니다.
* **필요 컴포넌트**: `SkillsComponent`, `StatsComponent` 또는 `ExtendedStatsComponent`
* **핵심 API**:
  * `skills.useSkill({ casterId, skillId, targetIds })`
  * `skills.registerEffect(type, handler)`: 프로젝트 고유 스킬 효과 등록
* **발행 이벤트**:
  * `'skill:used'`: `{ casterId, skillId, targetIds }`
  * `'skill:failed'`: `{ casterId, skillId, reason, constraintReason }`
  * `'skill:cooldown:ready'`: `{ entityId, skillId }`

---

## 2-1. StatusEffectSystem (상태이상 & 도트 라이프사이클)
* **역할**: 턴제(`mode: 'turn'`) 및 실시간(`mode: 'realtime'`) 지속시간 자동 차감, 도트 틱(화상/중독 등) 피해 주기적 적용, 상태이상 만료 시 `StatModsComponent`의 연계 버프 자동 롤백을 처리합니다.
* **필요 컴포넌트**: `StatusEffectsComponent` (선택적: `StatModsComponent`, `StatsComponent`, `ExtendedStatsComponent`)
* **핵심 API**:
  * `statusSystem.applyStatus(entity, statusId, duration, sourceEntityId, stacks?, maxStacks?, options?)`
  * `statusSystem.removeStatus(entity, statusId)`: 수동 해제 및 연동 스탯 버프 즉시 롤백
* **발행 이벤트**:
  * `'status:applied'`: `{ entityId, statusId, duration, stacks, sourceEntityId }`
  * `'status:expired'`: `{ entityId, statusId }`
  * `'status:removed'`: `{ entityId, statusId }`
  * `'status:tick:damage'`: `{ entityId, statusId, damage, sourceEntityId }`


---

## 3. EquipmentSystem (장비 장착/해제)
* **역할**: 인벤토리 아이템을 장착 슬롯으로 이동하고, 제약조건 검사 및 스탯 모디파이어를 자동으로 반영합니다.
* **필요 컴포넌트**: `EquipmentComponent`, `InventoryComponent`, `StatModsComponent`
* **요청 메서드**:
  * `equipment.requestEquip({ entityId, slot, itemId })`
  * `equipment.requestUnequip({ entityId, slot })`
* **발행 이벤트**:
  * `'equipment:equipped'`: `{ entityId, slot, itemId }`
  * `'equipment:unequipped'`: `{ entityId, slot, itemId }`
  * `'equipment:failed'`: `{ entityId, slot, itemId, reason, details }`

---

## 4. StatModSystem (버프 & 디버프)
* **역할**: 임시/영구 스탯 변화(flat, percent)의 지속시간(duration)을 매 틱 감소시키고 만료 시 제거합니다.
* **필요 컴포넌트**: `StatModsComponent`
* **요청 메서드**:
  * `statMods.addMod({ entityId, mod })`
  * `statMods.removeMod({ entityId, sourceId, stat })`
* **발행 이벤트**:
  * `'stat_mod:added'`: `{ entityId, sourceId, stat, flat, percent }`
  * `'stat_mod:expired'`: `{ entityId, sourceId, stat }`
  * `'stat_mod:removed'`: `{ entityId, sourceId, stat }`

---

## 5. InventorySystem (인벤토리)
* **역할**: 아이템의 획득 및 제거, 슬롯 수 제한 및 수량 중첩을 관리합니다.
* **필요 컴포넌트**: `InventoryComponent`
* **요청 메서드**: `inventory.request({ type: 'add' | 'remove', entityId, defId, quantity })`
* **발행 이벤트**:
  * `'inventory:item:added'`: `{ entityId, defId, quantity }`
  * `'inventory:item:removed'`: `{ entityId, defId, quantity }`
  * `'inventory:full'`: `{ entityId }`

---

## 6. ProgressionSystem (경험치 & 레벨업)
* **역할**: 경험치를 누적하고 필요 경험치 도달 시 다중 레벨업 및 스탯 성장을 처리합니다.
* **필요 컴포넌트**: `ProgressionComponent`, `StatsComponent`
* **요청 메서드**:
  * `progression.addExp(entityId, amount)`
  * `progression.applyExpDirect(entity, amount)` (프레임 지연 없는 즉시 반영)
* **발행 이벤트**:
  * `'progression:exp_gained'`: `{ entityId, amount, currentExp, requiredExp, level }`
  * `'progression:levelup'`: `{ entityId, oldLevel, newLevel, levelsGained, statsGained }`

---

## 7. LootSystem (전리품 드랍)
* **역할**: 엔티티 사망 시 드랍 테이블을 롤링하여 수령자 인벤토리에 아이템을 지급하고 처치 경험치를 전달합니다.
* **필요 컴포넌트**: `LootComponent`
* **요청 메서드**: `loot.processLoot(deadEntityId, receiverId?)`
* **발행 이벤트**:
  * `'loot:dropped'`: `{ deadEntityId, receiverId, items, exp }`

---

## 8. TurnSystem (턴제 & 라운드)
* **역할**: 속도(`speed`) 또는 이니셔티브에 따라 생존 엔티티들의 턴 순서를 내림차순 정렬하고 턴 전환을 관장합니다.
* **필요 컴포넌트**: `TurnComponent`, `StatsComponent`
* **요청 메서드**:
  * `turn.startRound(entities?)`: 새 라운드 시작 및 턴 큐 빌드
  * `turn.nextTurn()`: 다음 엔티티로 턴 넘김
  * `turn.endTurn(entityId)`: 현재 엔티티의 턴 종료
* **발행 이벤트**:
  * `'turn:round:started'`: `{ round, turnOrder }`
  * `'turn:started'`: `{ round, entityId, turnIndex }`
  * `'turn:ended'`: `{ round, entityId }`
  * `'turn:round:ended'`: `{ round }`

---

## 9. MovementSystem (2D 그리드 이동 & 충돌)
* **역할**: 엔티티의 2D 타일 좌표 이동을 처리하며, 맵 경계, 장애물 타일, 다른 엔티티와의 충돌을 판정합니다.
* **필요 컴포넌트**: `PositionComponent`
* **요청 메서드**:
  * `movement.requestMove(entityId, targetX, targetY)`
  * `movement.requestMoveBy(entityId, dx, dy, entities)`
* **발행 이벤트**:
  * `'movement:moved'`: `{ entityId, fromX, fromY, toX, toY }`
  * `'movement:blocked'`: `{ entityId, fromX, fromY, targetX, targetY, reason }`

---

## 10. System 공통 제어 프로퍼티
모든 System 인스턴스는 World 레벨에서 다음 프로퍼티를 통해 실행 순서 및 일시정지 제어가 가능합니다:
* **`system.enabled: boolean`** (기본값: `true`):
  * `false`로 설정 시 `world.update()` 루프에서 해당 시스템의 update 실행이 자동으로 스킵됩니다.
  * 메뉴 화면, 인벤토리 오픈, 컷씬 중 전투나 이동 시스템 일시정지에 사용됩니다.
* **`system.priority: number`** (기본값: `0`):
  * `world.addSystem()` 등록 시 우선순위가 높은 시스템이 먼저 실행되도록 자동 내림차순 정렬됩니다.
  * 예: 입력(100) -> 이동(50) -> 전투(30) -> 정리(0)

