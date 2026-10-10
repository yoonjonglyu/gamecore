# GameCore Architecture

GameCore는 **데이터 중심(Data-Driven)**이며 **플랫폼 독립적(Platform-Agnostic)**인 게임 로직 프레임워크입니다.  
웹, 콘솔(CLI), 모바일, 캔버스 등 어떤 환경에서든 동일한 코어 게임 규칙이 동작하도록 설계되었습니다.

---

## 1. 핵심 설계 철학

1. **상태(Data)와 로직(Logic)의 완전한 분리**
   * 데이터는 `Component`에만 존재합니다 (상태 변경 로직 없음).
   * 로직은 `System`에만 존재합니다 (내부 상태 보관 지양, 쿼리된 컴포넌트만 조작).
2. **조합 기반 설계 (Composition over Inheritance)**
   * 클래스 상속(`Player extends Character`) 대신, 필요한 컴포넌트들의 결합(`Entity.add(Stats).add(Inventory)`)으로 모든 게임 객체를 구성합니다.
3. **느슨한 결합 (Loose Coupling via EventBus)**
   * 시스템끼리 서로를 직접 알 필요 없이, `EventBus`의 pub/sub 이벤트를 통해 상태 변화를 감지하고 반응합니다.
4. **마스터 데이터와 런타임 인스턴스의 분리**
   * 게임의 기획 데이터(아이템 스펙, 스킬 계수, 몬스터 템플릿)는 `DataManager`에서 관리합니다.
   * 런타임 인스턴스는 `EntityFactory`를 통해 블루프린트로부터 자동 조립되어 월드에 스폰됩니다.

---

## 2. 레이어 구조

```
┌────────────────────────────────────────────────────────┐
│             Interface Layer (UI / Rendering)           │
│  - Web Canvas, React, Terminal CLI, PixiJS, Phaser 등   │
├────────────────────────────────────────────────────────┤
│             Game Data Layer (Master Data)              │
│  - Registry<ItemDef>, Registry<SkillDef>               │
│  - Registry<EntityBlueprint>                           │
├────────────────────────────────────────────────────────┤
│             Factory Layer (Instantiation)              │
│  - EntityFactory (블루프린트 파서 & 컴포넌트 조립기)       │
├────────────────────────────────────────────────────────┤
│             ECS Runtime Engine Layer                   │
│  - World (오케스트레이터 & 게임 루프)                     │
│  - EventBus (타입 안전 이벤트 중재기)                     │
│  - Systems (Combat, Skill, Equipment, Turn, Movement)  │
│  - Entities & Components (Stats, Position, Inventory)  │
├────────────────────────────────────────────────────────┤
│             Persistence Layer (Save / Load)            │
│  - WorldSerializer & ComponentRegistry (JSON 입출력)   │
└────────────────────────────────────────────────────────┘
```

---

## 3. 핵심 클래스 역할

### `Entity`
* 고유 식별자(`id: number`)와 태그 집합(`tags: Set<string>`), 컴포넌트 맵을 갖는 가벼운 컨테이너입니다.
* `add(comp)`, `get(CompClass)`, `has(CompClass)`, `remove(CompClass)`, `hasTag(tag)` 제공.

### `Component`
* 순수 데이터 클래스입니다.
* `entityId` 속성을 통해 자신이 속한 엔티티의 ID를 알 수 있습니다.

### `System`
* 특정 컴포넌트 조합(`query`)을 가진 엔티티들을 주기적으로 순회하며 규칙을 실행합니다.
* `update(entities, delta)`를 구현하며, `this.bus`를 통해 이벤트를 발행/수신합니다.

### `World`
* 엔티티 생성/삭제 및 시스템 틱(`world.update(delta, mode)`)을 조율하는 중심 오케스트레이터입니다.
* 내장 `EventBus`를 통해 시스템 간 이벤트 통신을 중재합니다.
* `clearEntities()`를 통해 시스템과 이벤트 리스너를 보존한 채 엔티티 전체를 일괄 초기화할 수 있습니다.

---

## 4. 4대 핵심 코어 파이프라인

1. **커스텀 스탯 파이프라인 (`StatPipeline` / `ExtendedStatsComponent`)**:
   * 4단계 연산 순서 보장: Base Stat $\rightarrow$ Flat(+) $\rightarrow$ Percent(%) $\rightarrow$ Final Amplification(%)
   * DAG(Directed Acyclic Graph) 기반 스탯 의존성 수식 정의 (`matk = int * 2 + wis * 0.8`) 및 순환 참조 감지
   * Dirty Flag & Caching을 통한 초고속 $O(1)$ 연산 최적화
2. **전략형 플러거블 전투 파이프라인 (`CombatSystem` / `CombatPipeline`)**:
   * 전략 패턴 기반 `DamageCalculator` 인터페이스로 게임별 커스텀 데미지 수식 주입
   * 4단계 라이프사이클 미들웨어 (`onPreHit`, `onDamageCalculate`, `onShieldAbsorb`, `onPostHit`)
   * `BarrierComponent` 실드 흡수 및 파괴 라이프사이클 분리
   * 역산 꼼수 없는 `CombatContext` 기반 순수 파라미터 전달 (흡혈, 반사, 무적 등)
3. **시간 추상화 & 상태이상 파이프라인 (`SkillEffectExecutor` / `StatusEffectSystem`)**:
   * 턴제(`mode: 'turn'`)와 실시간(`mode: 'realtime'`) 통합 지원
   * `SkillEffectExecutor`를 통한 데미지/회복/상태이상/스탯버프 선언적 디스패치 및 커스텀 효과 확장
   * `StatusEffectSystem`을 통한 도트 틱 주기 실행 및 버프 만료 시 연계 모디파이어 자동 롤백/클린업
4. **UI 비종속 Observer / Subscription & React 19 바인딩**:
   * 제로 의존성 `entity.subscribe(listener)` 및 `world.subscribe(listener)` 내장
   * `@ryuis-gamecore/react` 서브패스를 통해 React 19 `useSyncExternalStore` 기반 바인딩 훅 제공 (`useEntity`, `useComponent`, `useWorldEntities`)

