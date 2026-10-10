# GameCore Built-in Systems Reference (v1.0.0)

GameCore가 기본 제공하는 핵심 시스템 및 파이프라인의 역할, 처리 흐름, API 명세입니다.

---

## 1. GameWorldManager (게임 상태 총괄 오케스트레이터)
* **역할**: World, EventBus, Seeded PRNG 및 내장 핵심 시스템들을 한 곳에서 총괄하는 고수준 파사드 매니저입니다.
* **생성 옵션**:
  ```ts
  interface GameWorldManagerOptions {
    seed?: number | string;
    random?: SeededRandom;
    bus?: EventBus<CoreEvents>;
    autoRegisterDefaults?: boolean; // 기본값: true
    rounding?: CombatRoundingConfig;
    systems?: System[];
  }
  ```
* **핵심 API**:
  * `manager.world`: World 인스턴스 접근
  * `manager.random`: 주입된 SeededRandom 인스턴스
  * `manager.combatSystem`, `manager.skillSystem`, `manager.fsmSystem`, `manager.questSystem` 등 내장 시스템 다이렉트 접근
  * `manager.update(delta, mode)`: 게임 루프 일괄 틱

---

## 2. SeededRandom & PRNG 엔진
* **역할**: PCG32 알고리즘 기반의 결정론적 난수 생성기. 서버 리플레이 검증 및 치트 방지를 보장합니다.
* **핵심 API**:
  * `next()`: [0, 1) 실수
  * `nextInt(min, max)`: [min, max] 정수
  * `nextFloat(min, max)`: [min, max) 실수
  * `chance(probability)`: 0~1 확률 주사위
  * `pick(array)`, `shuffle(array)`
  * `exportState()`, `importState(state)`: PRNG 상태 직렬화 및 복원

---

## 3. CombatSystem & CombatPipeline (전략형 플러거블 전투)
* **역할**: 전략 패턴(`DamageCalculator`), 4단계 라이프사이클 미들웨어(`onPreHit`, `onDamageCalculate`, `onShieldAbsorb`, `onPostHit`), 라운딩 정책(`CombatRoundingConfig`) 및 연출 큐(`CuePayload`)를 통해 전투를 처리합니다.
* **요구 컴포넌트**: `StatsComponent` 또는 `ExtendedStatsComponent` (선택: `BarrierComponent`, `StatModsComponent`)
* **핵심 API**:
  * `combat.requestAttack(req)`: 공격 요청
  * `combat.setRandom(random)`: 결정론적 PRNG 주입
  * `combat.setRounding(config)`: 대미지 반올림/내림/올림 및 정밀도 정책 적용
  * `combat.setCalculator(calculator)`: 대미지 수식 전략 교체
  * `combat.use(middleware)`: 4단계 미들웨어 주입

---

## 4. SkillSystem & SkillEffectExecutor (고수준 선언적 스킬)
* **역할**: 선언적 스킬 즉시 시전 파이프라인 및 큐 기반 비동기 실행을 모두 지원합니다.
* **요구 컴포넌트**: `SkillsComponent`, `StatsComponent` 또는 `ExtendedStatsComponent`
* **핵심 API**:
  * `skillSys.canCast(caster, skillDef)`: 쿨다운, MP/기력 자원, 생사, 제약조건 검증 (`{ ok: boolean, reason?: string }`)
  * `skillSys.castSkill(caster, targets, skillDef)`: 리소스 차감 ➔ 쿨다운 시작 ➔ 효과 실행 ➔ 이벤트 일괄 발행
  * `skillSys.useSkill(req)`: 큐 기반 스킬 요청
  * `skillSys.registerEffect(type, handler)`: 프로젝트 고유 스킬 효과 확장

---

## 5. Blackboard (전역 상태 & 시나리오 플래그 저장소)
* **역할**: 엔티티에 종속되지 않는 전역 게임 데이터(진행 챕터, 던전 난이도, 날씨, 퀘스트 플래그)를 관리합니다.
* **핵심 API**:
  * `world.blackboard.set(key, val)`, `world.blackboard.get(key, defaultVal)`
  * `world.blackboard.increment(key, delta)`, `world.blackboard.toggle(key)`
  * `world.blackboard.subscribe(listener)`: 값 변경 감지 옵저버 (자동으로 `blackboard:changed` 이벤트 발행)
  * `world.blackboard.toJSON()`, `world.blackboard.fromJSON(data)`

---

## 6. TimerScheduler (시간 ms & 턴 단위 스케줄러)
* **역할**: World 틱과 완벽히 동기화되어 특정 시간(ms) 또는 턴(turn) 경과 후 실행되거나 주기적으로 반복되는 작업을 예약합니다.
* **핵심 API**:
  * `world.schedule(delayMs, callback)`: 시간 지연 1회 실행
  * `world.scheduleEvery(intervalMs, callback, times?)`: 시간 간격 반복 실행 (times 제한 가능)
  * `world.scheduleTurns(turns, callback)`: 턴 지연 1회 실행
  * `world.scheduleTurnsEvery(intervalTurns, callback, times?)`: 턴 간격 반복 실행
  * 반환된 핸들 호출 `task()` 또는 `task.cancel()`로 예약 취소

---

## 7. FSMComponent & FSMSystem (유한 상태 머신)
* **역할**: 엔티티의 행동 상태(Idle, Move, Attack, Casting, Stunned, Dead 등) 전이 규칙 및 배타적 플래그(`canMove`, `canCast`, `canAttack`)를 관리합니다.
* **핵심 API**:
  * `fsm.transitionTo(nextState, force?)`: 상태 전이 시도 (허용 전이 규칙 검증)
  * `fsm.canMove`, `fsm.canCast`, `fsm.canAttack`: 액션 실행 가능 여부 플래그
  * `duration`, `autoTransitionTo`: 지속 시간 만료 시 이전/기본 상태로 자동 전이 (`FSMSystem`이 매 틱 갱신)
  * 발행 이벤트: `'fsm:state:changed'` (`{ entityId, prev, next }`)

---

## 8. SpatialHashGrid (2D 연속 공간 해시)
* **역할**: 타일 그리드가 아닌 연속 실수 평면 `(x, y)` 상에서 대규모 엔티티의 반경 검색 및 충돌 판정을 O(1)로 수행합니다.
* **핵심 API**:
  * `grid.insert(id, x, y, radius?)`, `grid.update(id, x, y, radius?)`, `grid.remove(id)`
  * `grid.queryRadius(x, y, radius)`: 거리 오름차순으로 정렬된 엔티티 및 거리 배열 조회
  * `grid.queryAABB(minX, minY, maxX, maxY)`: 사각 영역 내부 엔티티 ID 조회
  * `grid.findNearest(x, y, maxRadius?)`: 가장 가까운 엔티티 탐색

---

## 9. QuestsComponent & QuestSystem (퀘스트 & 업적 추적)
* **역할**: 목표(kill, collect, reach, custom) 기반 퀘스트 인스턴스를 관리하며, 게임 내 이벤트(`stats:died`, `inventory:item:added` 등)에 반응하여 자동으로 진행도를 갱신합니다.
* **핵심 API**:
  * `questSys.advanceObjective(entityId, questId?, typeOrId?, amount?, filter?)`: 목표 전진
  * `questSys.grantReward(entityId, questId)`: 완료된 퀘스트의 보상(경험치, 인벤토리 아이템) 지급
  * `autoComplete`: 목표 달성 시 'completed' 자동 전이
  * `autoReward`: 완료 즉시 경험치 및 아이템 자동 지급
  * 발행 이벤트: `'quest:progress'`, `'quest:completed'`, `'quest:rewarded'`

---

## 10. CueProtocol & CueQueue (시각/음향 연출 큐)
* **역할**: 순수 헤드리스 게임 엔진과 렌더러/오디오 엔진(Pixi, Phaser, Three.js, Howler, Godot 등) 간의 SFX, VFX, 화면 흔들림(shake), 플래시 효과를 규격화하여 전달합니다.
* **핵심 API**:
  * `createCue(type, payload, sourceId?, targetId?)`
  * `cueQueue.push(cue)`, `cueQueue.emit(type, payload)`
  * `cueQueue.flush()`: 매 프레임 쌓인 연출을 일괄 꺼내어 렌더러에서 소비
  * `cueQueue.subscribe(fn)`: 실시간 연출 구독

---

## 11. SaveManager (무결성 검증 & 버전 마이그레이션)
* **역할**: 0-Dependency 순수 TS 기반 HMAC-SHA256 전자 서명 체크섬과 스키마 버전 마이그레이션을 지원합니다. 전역 블랙보드 및 FSM, Quests 상태까지 일괄 저장/복원합니다.
* **핵심 API**:
  * `SaveManager.serialize(world, secretKey?, version?)`: 위변조 방지 봉투(Envelope) JSON 문자열 생성
  * `SaveManager.deserialize(payload, world, secretKey?)`: 체크섬 검증 및 버전 마이그레이션 후 복원 (`DeserializationResult`)
  * `SaveManager.registerMigration(fromVer, toVer, migrator)`: 스키마 버전별 변환 체인 등록

---

## 12. DropTable & AffixGenerator (절차적 전리품 엔진)
* **역할**: 확률 기반 전리품 롤링과 ARPG 스타일 접두사/접미사(Affix) 난수 능력치 부여 엔진입니다.
* **핵심 API**:
  * `dropTable.rollIndependent(random?)`: 각 아이템의 chance 확률 독립 추첨
  * `dropTable.rollWeighted(count, random?)`: 가중치(weight) 풀에서 N개 아이템 추첨
  * `affixGen.registerAffix(rarity, affixDef)`: 등급별 접사 등록
  * `affixGen.generate(baseItem, rarity, random?)`: 접사 합성된 고유 아이템 인스턴스 생성

---

## 13. World & Reactive ECS Events
* **역할**: 엔티티 및 시스템 오케스트레이션, UI 리액티브 이벤트 발행 및 대량 연산 배치 최적화.
* **핵심 API**:
  * `world.batchUpdates(fn)`: 대량 연산 시 이벤트 지연 및 Deduplication 후 일괄 발행
  * `world.subscribe(listener)`: 엔티티 생성/삭제 옵저버
  * `entity.notifyUpdated(ComponentType)`: 컴포넌트 필드 변경 통지
* **발행 이벤트**:
  * `'ecs:component:updated'`: `{ entityId, componentName, component }`
  * `'ecs:component:removed'`: `{ entityId, componentName }`
  * `'blackboard:changed'`, `'fsm:state:changed'`, `'quest:completed'` 등
