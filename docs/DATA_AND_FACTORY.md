# GameCore Data & Factory Guide

GameCore는 코드 내부 하드코딩을 배제하고, 모든 게임 명세(아이템, 스킬, 몬스터, NPC)를 **외부 데이터(JSON / Object)**로부터 주입받아 조립하는 **데이터 주도(Data-Driven)** 방식을 취합니다.

---

## 1. Registry & DataManager

### `Registry<T>`
고유한 식별자(`id: string | number`)를 가진 마스터 데이터를 보관하는 타입 안전 저장소입니다.

```ts
const runeRegistry = new Registry<RuneDef>();

runeRegistry.register({ id: 'rune_fire', name: '화염의 룬' });
runeRegistry.registerMany([ ... ]);
const item = runeRegistry.get('rune_fire');
const all = runeRegistry.all();
```

### `DataManager`
게임의 표준 레지스트리들을 중앙에서 모아 관리합니다.
* `data.items`: `Registry<ItemDef>`
* `data.skills`: `Registry<SkillDef>`
* `data.blueprints`: `Registry<EntityBlueprint>`
* `data.getOrCreateRegistry(name)`: 프로젝트 고유 레지스트리 동적 생성

#### 번들(Bundle) 일괄 주입
```ts
const data = new DataManager({
  items: [ ... ],
  skills: [ ... ],
  blueprints: [ ... ],
  custom: {
    cards: [ ... ],
    relics: [ ... ]
  }
});
```

---

## 2. EntityBlueprint (엔티티 조립 명세서)

"이 몬스터/오브젝트는 어떤 컴포넌트들의 조합인가?"를 정의한 데이터 명세서입니다.

```ts
export interface EntityBlueprint {
  id: string;                      // 블루프린트 고유 식별자 (예: 'goblin_warrior')
  tags?: string[];                 // 태그 목록 (예: ['enemy', 'monster'])
  identity?: {
    idx?: number;
    name: string;
    description?: string;
  };
  stats?: Partial<Stats>;          // 기본 스탯 (maxHp, attack, defense 등)
  skills?: string[];               // 기본 학습할 스킬 ID 목록 (SkillRegistry 연동)
  inventory?: Array<{ itemId: string | number; count?: number }>;
  equipment?: Record<string, string | number>; // slotName -> itemId
  custom?: Record<string, unknown>;// 프로젝트 전용 커스텀 컴포넌트 설정 데이터
}
```

---

## 3. EntityFactory (블루프린트 조립 공장)

블루프린트 ID를 받아 월드 내 [Entity](file:///e:/withc/Documents/coding/gamecore/src/core/Entity.ts)로 자동 조립하여 스폰합니다.

```ts
const factory = new EntityFactory(world, data);

// 1. 기본 스폰
const goblin = factory.spawn('goblin_warrior');

// 2. 런타임 오버라이드 스폰 (보스 몬스터, 강화 개체)
const boss = factory.spawn('goblin_warrior', {
  name: '고블린 족장',
  tags: ['boss'],
  overrideStats: { maxHp: 300, attack: 30 },
  extraInventory: [{ itemId: 'rare_gem', count: 1 }],
});

// 3. 필드 드랍 아이템 엔티티 생성
const dropItem = factory.createItemEntity('potion_hp', { tags: ['loot'] });
```

### 플러그인 확장 (`registerComponentHandler`)
코어에 없는 커스텀 컴포넌트도 팩토리에 핸들러를 등록해두면 블루프린트의 `custom` 속성을 읽어 자동 조립됩니다:

```ts
factory.registerComponentHandler('ai', (entity, config) => {
  entity.add(new AIComponent((config as any).mode));
});

// 블루프린트에서:
// custom: { ai: { mode: 'patrol' } }
```
이로써 코어 수정 없이 어떤 복잡한 컴포넌트도 데이터 기반으로 스폰할 수 있습니다.
