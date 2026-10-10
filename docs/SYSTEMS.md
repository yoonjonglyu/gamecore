# GameCore Built-in Systems Reference (v0.3.0)

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
  * `manager.combatSystem`, `manager.skillSystem`, `manager.lootSystem` 등 내장 시스템 다이렉트 접근
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
* **역할**: 전략 패턴(`DamageCalculator`), 4단계 라이프사이클 미들웨어(`onPreHit`, `onDamageCalculate`, `onShieldAbsorb`, `onPostHit`), 라운딩 정책(`CombatRoundingConfig`)을 통해 전투를 처리합니다.
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

## 5. SaveManager (무결성 검증 & 버전 마이그레이션)
* **역할**: 0-Dependency 순수 TS 기반 HMAC-SHA256 전자 서명 체크섬과 스키마 버전 마이그레이션을 지원합니다.
* **핵심 API**:
  * `SaveManager.serialize(world, secretKey?, version?)`: 위변조 방지 봉투(Envelope) JSON 문자열 생성
  * `SaveManager.deserialize(payload, world, secretKey?)`: 체크섬 검증 및 버전 마이그레이션 후 복원 (`DeserializationResult`)
  * `SaveManager.registerMigration(fromVer, toVer, migrator)`: 스키마 버전별 변환 체인 등록

---

## 6. DropTable & AffixGenerator (절차적 전리품 엔진)
* **역할**: 확률 기반 전리품 롤링과 ARPG 스타일 접두사/접미사(Affix) 난수 능력치 부여 엔진입니다.
* **핵심 API**:
  * `dropTable.rollIndependent(random?)`: 각 아이템의 chance 확률 독립 추첨
  * `dropTable.rollWeighted(count, random?)`: 가중치(weight) 풀에서 N개 아이템 추첨
  * `affixGen.registerAffix(rarity, affixDef)`: 등급별 접사 등록
  * `affixGen.generate(baseItem, rarity, random?)`: 접사 합성된 고유 아이템 인스턴스 생성

---

## 7. World & Reactive ECS Events
* **역할**: 엔티티 및 시스템 오케스트레이션, UI 리액티브 이벤트 발행 및 대량 연산 배치 최적화.
* **핵심 API**:
  * `world.batchUpdates(fn)`: 대량 연산 시 이벤트 지연 및 Deduplication 후 일괄 발행
  * `world.subscribe(listener)`: 엔티티 생성/삭제 옵저버
  * `entity.notifyUpdated(ComponentType)`: 컴포넌트 필드 변경 통지
* **발행 이벤트**:
  * `'ecs:component:updated'`: `{ entityId, componentName, component }`
  * `'ecs:component:removed'`: `{ entityId, componentName }`
