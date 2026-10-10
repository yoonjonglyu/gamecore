# GameCore (`ryuis-gamecore`)

> **Headless, Deterministic, Data-Driven Game Engine & State Framework**  
> 특정 실행 환경(Web Canvas, React, Node.js 서버, React Native, CLI 등)에 구애받지 않고 **게임의 상태, 수치 연산, 규칙 및 시뮬레이션 로직**을 온전히 캡슐화하는 범용 0-Dependency 게임 코어 엔진입니다.

[![npm version](https://img.shields.io/npm/v/ryuis-gamecore.svg)](https://www.npmjs.com/package/ryuis-gamecore)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![0-Dependency](https://img.shields.io/badge/Dependencies-0-green)](package.json)

---

## 🏛 아키텍처 다이어그램

```
┌────────────────────────────────────────────────────────────────────────┐
│                   External Game Project (Consumer)                     │
│  - items.json, skills.json, blueprints.json (마스터 데이터 주입)         │
│  - Custom Components & Systems (게임별 고유 룰/컨텐츠 구현)               │
│  - Interface Layer (React 19, Pixi.js, Three.js, Canvas, Node Server)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Data Injection & Plugins
┌───────────────────────────────────▼────────────────────────────────────┐
│                        ryuis-gamecore (Engine)                         │
│                                                                        │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │   GameWorldManager      │  │   SeededRandom (PCG32 PRNG)         │  │
│  │   (Facade Orchestrator) │  │   결정론적 난수 & 리플레이 검증 지원   │  │
│  └────────────┬────────────┘  └──────────────────┬──────────────────┘  │
│               │                                  │                     │
│  ┌────────────▼──────────────────────────────────▼──────────────────┐  │
│  │  World (ECS Core) & EventBus                                     │  │
│  │  - Reactive Component Events (`ecs:component:updated/removed`)   │  │
│  │  - `world.batchUpdates(fn)` (대량 연산 지연 및 Deduplication)    │  │
│  │  - Zero-dependency `subscribe()` Observer (React 19 훅 바인딩)   │  │
│  └────────────┬──────────────────────────────────┬──────────────────┘  │
│               │                                  │                     │
│  ┌────────────▼──────────────┐    ┌──────────────▼──────────────────┐  │
│  │  Pipelines & Systems      │    │  Data, Loot & Serialization     │  │
│  │  - Custom Stat Pipeline   │    │  - DropTable (확률 & 가중치)    │  │
│  │  - Pluggable Combat Pipe  │    │  - AffixGenerator (접사 엔진)   │  │
│  │  - Precision Rounding     │    │  - SaveManager (HMAC-SHA256     │  │
│  │  - High-Level Skill Pipe  │    │    변조 방지 & 버전 마이그레이션) │  │
│  │  - Status & Equipment     │    │  - WorldSerializer / Registry   │  │
│  └───────────────────────────┘    └─────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ v0.3.0 주요 핵심 모듈

| 모듈 | 핵심 클래스 및 유틸 | 상세 설명 |
|------|-------------------|-----------|
| **1) 결정론적 PRNG 엔진** | `SeededRandom`, `GameWorldManager` | PCG32 알고리즘 기반. 시드 주입(`number \| string`), 전투/회피/크리티컬 판정 재현, 상태 직렬화(`exportState/importState`). |
| **2) 정밀도 & 라운딩 정책** | `CombatRoundingConfig`, `applyRounding`, `ModsComponent` | 부동소수점 오차(`14.799999999999999`) 원천 차단. `round`, `floor`, `ceil`, `raw` 모드 및 소수점 자리수 제어. |
| **3) 세이브 무결성 & 마이그레이션** | `SaveManager`, `sha256`, `hmacSha256` | 0-Dependency 순수 TS HMAC-SHA256 전자 서명 체크섬. 변조 감지 시 복원 차단. 스키마 버전 마이그레이션 파이프라인. |
| **4) 반응형 ECS 이벤트 & 배치** | `World.batchUpdates()`, `Entity.notifyUpdated()` | 컴포넌트 추가/수정/삭제 시 `ecs:component:updated`, `ecs:component:removed` 자동 발행. 배치 연산 시 중복 제거 후 1회 발행. |
| **5) 고수준 스킬 실행 파이프라인** | `SkillSystem.canCast()`, `SkillSystem.castSkill()` | 쿨다운, MP/기력 자원, 생사, 제약조건 자동 판정 및 리소스 차감 -> 쿨다운 등록 -> 계산 -> 버프 적용 -> 결과 이벤트 일괄 발행. |
| **6) 절차적 전리품 & 접사 엔진** | `DropTable`, `AffixGenerator` | 독립 확률 롤링 + 가중치 추첨 롤링. 등급(Rarity)별 접두사/접미사(Prefix/Suffix) 조합 및 능력치 난수 부여 엔진. |
| **7) 커스텀 스탯 파이프라인** | `StatPipeline`, `ExtendedStatsComponent` | 4단계 연산(Base ➔ Flat ➔ Percent ➔ Amp), DAG 의존 수식(`matk = int * 2 + wis * 0.8`), Dirty Flag 캐싱. |
| **8) 전략형 전투 파이프라인** | `CombatPipeline`, `DamageCalculator`, `BarrierComponent` | 4단계 미들웨어(onPreHit ➔ onDamageCalculate ➔ onShieldAbsorb ➔ onPostHit), 실드 흡수, 전략 패턴 계산기. |
| **9) React 19 바인딩** | `ryuis-gamecore/react` | React 19 `useSyncExternalStore` 기반 무누수, 무티어링 렌더링 훅 (`useEntity`, `useComponent`, `useWorldEntities`). |

---

## 🚀 빠른 시작 (Quick Start)

### 1. 패키지 설치
```bash
npm install ryuis-gamecore
# 또는
pnpm add ryuis-gamecore
```

### 2. GameWorldManager를 통한 1줄 부트스트랩
```ts
import { GameWorldManager, StatsComponent } from 'ryuis-gamecore';

// 시드 기반 결정론적 게임 월드 생성 (전투, 스킬, 전리품 시스템 자동 등록)
const manager = new GameWorldManager({
  seed: 'dungeon-run-seed-1234',
  rounding: { mode: 'round', decimals: 0 },
});

// 엔티티 생성
const player = manager.world.createEntity('player');
player.add(new StatsComponent({ hp: 100, maxHp: 100, attack: 35, defense: 10 }));

const enemy = manager.world.createEntity('monster');
enemy.add(new StatsComponent({ hp: 80, maxHp: 80, defense: 5 }));

// 전투 공격 요청 (시드 기반 결정론적 명중/크리티컬 판정)
manager.combatSystem?.requestAttack({
  attackerId: player.id,
  targetId: enemy.id,
  critChance: 0.25,
});

// 게임 루프 틱 실행
manager.update(16);
```

### 3. 세이브 데이터 위변조 방지 & 버전 마이그레이션 (`SaveManager`)
```ts
import { SaveManager, World } from 'ryuis-gamecore';

const world = new World();

// 1. HMAC-SHA256 기반 서명 체크섬과 함께 직렬화
const savePayload = SaveManager.serialize(world, 'my-super-secret-key', 1);

// 2. v1 -> v2 스키마 마이그레이션 등록
SaveManager.registerMigration(1, 2, (data) => {
  data.version = 2;
  // 스키마 변환 로직
  return data;
});

// 3. 무결성 검증 후 복원 (변조 시 tampered: true 및 복원 차단)
const result = SaveManager.deserialize(savePayload, new World(), 'my-super-secret-key');
if (result.success) {
  console.log('세이브 복원 완료! 버전:', result.version);
} else {
  console.error('세이브 복원 실패 또는 데이터 변조 감지:', result.error);
}
```

### 4. 절차적 전리품 & 접사 엔진 (`DropTable` & `AffixGenerator`)
```ts
import { DropTable, AffixGenerator, SeededRandom } from 'ryuis-gamecore';

const rng = new SeededRandom('loot-seed');

// 1. 드랍 테이블 정의
const boxDrops = new DropTable('gold_chest', [
  { itemId: 'gold', chance: 1.0, min: 100, max: 200 },
  { itemId: 'magic_scroll', chance: 0.3, min: 1, max: 2 },
  { itemId: 'legendary_sword', weight: 5, min: 1, max: 1 },
]);

// 가중치 추첨 1개 드랍
const loot = boxDrops.rollWeighted(1, rng);

// 2. 접사(Prefix/Suffix) 부여 엔진
const affixGen = new AffixGenerator();
affixGen.registerAffix('rare', {
  id: 'flame',
  name: '화염의',
  type: 'prefix',
  stat: 'attack',
  minValue: 10,
  maxValue: 20,
});

const weapon = affixGen.generate(
  { id: 'broadsword', name: '브로드소드', baseStats: { attack: 25 } },
  'rare',
  rng,
);

console.log(weapon.fullName); // "화염의 브로드소드"
console.log(weapon.stats);    // { attack: 35 ~ 45 }
```

### 5. 대량 연산 시 배치 업데이트 (`world.batchUpdates`)
```ts
world.bus.on('ecs:component:updated', (e) => {
  console.log(`컴포넌트 변경 감지: 엔티티 ${e.entityId}, 컴포넌트: ${e.componentName}`);
});

// 100번 수정해도 배치 블록 종료 시 마지막 상태로 단 1회만 이벤트 발행 (UI 렌더링 최적화)
world.batchUpdates(() => {
  for (let i = 0; i < 100; i++) {
    stats.hp = i;
    entity.notifyUpdated(StatsComponent);
  }
});
```

---

## 📖 추가 기술 문서

- [시스템 아키텍처 명세서 (docs/ARCHITECTURE.md)](docs/ARCHITECTURE.md)
- [코어 시스템 API 가이드 (docs/SYSTEMS.md)](docs/SYSTEMS.md)
- [확장성 가이드 (docs/EXTENSIBILITY_GUIDE.md)](docs/EXTENSIBILITY_GUIDE.md)
- [마스터 데이터 및 팩토리 (docs/DATA_AND_FACTORY.md)](docs/DATA_AND_FACTORY.md)

---

## 📜 라이선스
ISC License © 2026 ISA (류윤종)
