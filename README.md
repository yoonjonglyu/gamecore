# GameCore

> 게임 state & model 시스템.
> 특정 환경에 따라 인터페이스나 API 관련 로직은 달라질 수 있어도
> **데이터에 관한 로직들은 달라지지 않는다**는 점에 착안한 프로젝트.
> 개인용 인디게임 시스템을 만들고 그걸 다양한 인터페이스와 플랫폼에 이식해보는게 목표.

---

## Architecture

**ECS (Entity-Component-System)** + **EventBus** 기반 범용 게임 코어.

```
┌──────────────────────────────────────────┐
│           Interface Layer                │  ← 플랫폼별 (Web, Terminal, CLI, ...)
├──────────────────────────────────────────┤
│               GameCore                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Entity  │ │Component │ │  System  │ │
│  │  (ID +   │ │ (Data)   │ │ (Logic)  │ │
│  │  Tags)   │ │          │ │          │ │
│  └──────────┘ └──────────┘ └──────────┘ │
│  ┌────────────────────────────────────┐  │
│  │    World (ECS Orchestrator)        │  │
│  │    EventBus (System 간 통신)       │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### Core

| 파일 | 역할 |
|------|------|
| `core/Entity.ts` | 컴포넌트 컨테이너. ID + 태그 + 컴포넌트 맵 |
| `core/Component.ts` | 순수 데이터 베이스 클래스 |
| `core/System.ts` | 로직 베이스 클래스. query로 처리할 컴포넌트 선언 |
| `core/World.ts` | ECS 오케스트레이터. Entity/System 관리 + 게임 루프 |
| `core/EventBus.ts` | 타입 안전 이벤트 버스 (pub/sub) |

### Components (Data)

| 파일 | 역할 |
|------|------|
| `components/StatsComponent.ts` | HP, MP, 공격력, 방어력, 속도 |
| `components/IdentityComponent.ts` | 이름, idx, 설명 |
| `components/InventoryComponent.ts` | 아이템 소지 목록 (슬롯 제한, 수량 스택) |
| `components/ItemDefComponent.ts` | 아이템 정의 데이터 (카테고리, 스펙, 가치) |

### Systems (Logic)

| 파일 | 역할 |
|------|------|
| `systems/CombatSystem.ts` | 데미지 계산, 크리티컬, 사망 처리 |
| `systems/InventorySystem.ts` | 아이템 추가/제거 + 이벤트 발행 |

---

## Quick Start

```ts
import { World, StatsComponent, IdentityComponent, CombatSystem, CoreEvents } from './src';

// 1. World 생성
const world = new World<CoreEvents>();

// 2. System 등록
const combat = new CombatSystem();
world.addSystem(combat);

// 3. Entity 생성 및 컴포넌트 추가
const player = world.createEntity('player');
player
  .add(new IdentityComponent(1, 'Hero'))
  .add(new StatsComponent({ maxHp: 200, attack: 25, defense: 10 }));

const enemy = world.createEntity('enemy');
enemy.add(new StatsComponent({ maxHp: 50, attack: 15, defense: 3 }));

// 4. 이벤트 구독
world.bus.on('stats:died', ({ entityId }) => {
  console.log(`Entity ${entityId} died!`);
});

world.bus.on('combat:damage', ({ effective, isCritical }) => {
  console.log(`Dealt ${effective} dmg ${isCritical ? '(CRIT!)' : ''}`);
});

// 5. 공격 요청 & 틱 실행
combat.requestAttack({ attackerId: enemy.id, targetId: player.id });
world.update(16); // 16ms tick
```

---

## Structure

```
src/
├── index.ts              # 공개 API 진입점
├── events.ts             # CoreEvents 타입 정의
├── core/
│   ├── Component.ts
│   ├── Entity.ts
│   ├── EventBus.ts
│   ├── System.ts
│   └── World.ts
├── components/
│   ├── StatsComponent.ts
│   ├── IdentityComponent.ts
│   ├── InventoryComponent.ts
│   └── ItemDefComponent.ts
└── systems/
    ├── CombatSystem.ts
    └── InventorySystem.ts

tests/
└── core.test.ts
```

## Scripts

```bash
pnpm test          # 테스트 실행 (vitest)
pnpm test:watch    # 워치 모드
pnpm build         # dist/ 빌드
pnpm typecheck     # 타입 체크만
```

---

## Author

dev ISA (류윤종)