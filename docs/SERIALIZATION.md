# GameCore Save & Load (Serialization) Guide

GameCore는 ECS의 특성(순수 데이터 컴포넌트)을 살려, 월드 전체의 상태를 손쉽게 JSON으로 직렬화하고 복원할 수 있는 `WorldSerializer`를 제공합니다.

---

## 1. 기본 사용법

```ts
import { WorldSerializer } from 'gamecore';

const serializer = new WorldSerializer();

// 1. 세이브: World의 모든 엔티티와 컴포넌트를 JSON 문자열로 변환
const saveJson = serializer.toJSON(world);
localStorage.setItem('my_game_save', saveJson);

// 2. 로드: 새로운 월드 세션에 복원
const newWorld = new World();
const restoredEntities = serializer.deserialize(saveJson, newWorld);
```

---

## 2. 옵션 활용

### 특정 엔티티만 필터링하여 저장 (`filterEntity`)
```ts
// 플레이어 엔티티만 단독 세이브
const playerSave = serializer.serialize(world, {
  filterEntity: (entity) => entity.hasTag('player'),
});
```

### 복원 전 대상 월드 초기화 (`clearWorld`)
```ts
// 대상 월드의 기존 엔티티를 모두 비우고 세이브 데이터로 덮어쓰기
serializer.deserialize(saveJson, targetWorld, { clearWorld: true });
```

---

## 3. 커스텀 컴포넌트 직렬화 등록

사용자가 새로 정의한 컴포넌트(`QuestComponent`, `RuneComponent` 등)도 `ComponentRegistry`에 등록하면 자동으로 세이브 파일에 포함됩니다.

```ts
import { Component, defaultComponentRegistry } from 'gamecore';

class QuestComponent extends Component {
  questId: string = '';
  completed: boolean = false;
  constructor(questId = '', completed = false) {
    super();
    this.questId = questId;
    this.completed = completed;
  }
}

// 레지스트리에 등록
defaultComponentRegistry.register(
  'QuestComponent',
  QuestComponent,
  (c) => ({ questId: c.questId, completed: c.completed }), // 직렬화 함수
  (d) => new QuestComponent(d.questId as string, d.completed as boolean) // 역직렬화 함수
);

// 이제 toJSON() 호출 시 자동으로 QuestComponent도 저장되고 복원됩니다.
```
