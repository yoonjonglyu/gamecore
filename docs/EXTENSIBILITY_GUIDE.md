# GameCore Extensibility Guide (새로운 시스템 추가 가이드)

게임 기획에 따라 **문양(Rune), 펫(Pet), 신성 권능(Blessing), 생명의 나무(World Tree), 훈련/숙련도(Mastery)** 등 새로운 메타 시스템이 요구될 때, **GameCore 코어 코드를 수정하지 않고** 플러그인 형태로 확장하는 표준 절차입니다.

---

## 5단계 확장 표준 절차

1. **데이터 정의 (Data Definition)**: 필요한 마스터 데이터 구조를 만들고 `data.getOrCreateRegistry()`에 등록
2. **컴포넌트 정의 (Component)**: 상태를 보관할 `Component` 클래스 작성
3. **팩토리 연동 (Factory Handler)**: 블루프린트에서 자동 조립되도록 `factory.registerComponentHandler()` 등록
4. **시스템 작성 (System)**: 로직을 수행할 `System` 작성 및 `world.addSystem()` 등록
5. **세이브/로드 등록 (Serialization)**: `defaultComponentRegistry.register()`에 등록하여 자동 영속화

---

## 💡 실전 예제 1: 문양(Rune/Glyph) 시스템

### 1) 데이터 & 컴포넌트
```ts
import { Component, System, Entity, StatModsComponent } from 'gamecore';

// 문양 컴포넌트: 장착된 룬 ID 목록
export class RuneComponent extends Component {
  equippedRunes: string[] = [];
  constructor(runes: string[] = []) {
    super();
    this.equippedRunes = runes;
  }
}
```

### 2) 팩토리 핸들러 등록
```ts
factory.registerComponentHandler('runes', (entity, runeIds) => {
  entity.add(new RuneComponent(runeIds as string[]));
});
```

### 3) 시스템 로직 및 StatMod 연동
```ts
export class RuneSystem extends System {
  readonly query = [RuneComponent, StatModsComponent];

  update(entities: Entity[]) {
    // 장착된 룬에 따라 StatModsComponent에 'rune:fire:attack' 같은 모디파이어를 자동 반영
  }
}
```

---

## 💡 실전 예제 2: 펫 / 소환수 (Pet / Companion) 시스템

펫은 별도의 엔진을 만들 필요 없이, **GameCore의 [Entity](file:///e:/withc/Documents/coding/gamecore/src/core/Entity.ts) 그 자체**로 표현됩니다.

```ts
// 1. 펫 블루프린트 등록
data.blueprints.register({
  id: 'pet_wolf',
  tags: ['pet', 'ally'],
  stats: { maxHp: 80, attack: 12, speed: 14 },
  skills: ['wolf_bite']
});

// 2. 주인과 펫을 연결하는 컴포넌트
class CompanionComponent extends Component {
  constructor(public ownerId: number) { super(); }
}

// 3. 팩토리로 스폰 및 주인 연결
const wolf = factory.spawn('pet_wolf');
wolf.add(new CompanionComponent(hero.id));

// 4. PetSystem (EventBus를 통해 주인의 행동에 반응)
class PetSystem extends System {
  onInit() {
    this.bus.on('combat:damage', ({ attackerId, targetId }) => {
      // 주인이 적을 공격하면 펫도 협동 공격 실행
    });
  }
}
```

---

## 💡 실전 예제 3: 생명의 나무 / 계정 영구 연구 (World Tree)

개별 캐릭터가 아닌 게임 전체/영지에 영향을 미치는 전역 메타 시스템:

```ts
// 1. 월드 내 전역 엔티티 생성
const worldTree = world.createEntity('world_tree');
worldTree.add(new TreeComponent({ level: 5, unlockedNodes: ['hp_boost', 'crit_up'] }));

// 2. 영웅 생성 시 또는 게임 틱에서 전역 버프를 StatMod로 부여
hero.get(StatModsComponent)?.add({
  sourceId: 'world_tree:hp_boost',
  stat: 'maxHp',
  flat: 50
});
```

---

## 💡 실전 예제 4: 커스텀 제약조건 추가 (`ConstraintChecker`)

"생명의 나무 3단계 이상인 자만 착용 가능한 전설 장비":

```ts
constraintChecker.registerCustomHandler('tree_level', (entity, requiredLevel) => {
  const tree = world.queryByTag('world_tree')[0]?.get(TreeComponent);
  const ok = (tree?.level ?? 0) >= (requiredLevel as number);
  return ok ? { ok: true } : { ok: false, reason: `생명의 나무 ${requiredLevel}단계 필요` };
});

// 아이템이나 스킬의 constraints에 즉시 적용 가능:
// constraints: [{ type: 'custom', id: 'tree_level', data: 3 }]
```
