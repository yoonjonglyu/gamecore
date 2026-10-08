---
name: gamecore
description: >-
  Develops games, mechanics, and systems using the gamecore package. Activate when
  the user is building games with gamecore, creating components, systems, combat,
  skills, items, inventory, equipment, progression, loot, turn queues, grid movement,
  or extending the core with custom meta systems (e.g. runes, pets, blessings, world tree).
---

# GameCore Developer Skill

This skill provides step-by-step guidance, rules, and best practices for developing games using the **`gamecore`** package.

`gamecore` is a platform-independent, data-driven, ECS (Entity-Component-System) engine designed to keep **game logic and data invariant** across any frontend (Web Canvas, React, Terminal CLI, PixiJS, Mobile).

---

## 1. Core Principles

1. **Components are Pure Data**: Store only state in components. Never place complex calculations, mutation of other entities, or I/O inside components.
2. **Systems are Pure Logic**: Systems operate on entities queried by component types (`query: ComponentType[]`). Systems should not retain internal game state.
3. **EventBus Communication**: Systems coordinate through `world.bus.emit()` and `world.bus.on()` to remain loosely coupled.
4. **Data-Driven Prefabs**: Avoid hardcoding `new StatsComponent()` directly in game scenes. Define master catalogs in `DataManager` and instantiate entities via `EntityFactory.spawn(blueprintId)`.
5. **Unified Stat Modifiers**: Buffs, equipment bonuses, talents, runes, and debuffs must use `StatModsComponent` (`flat` and `percent`) rather than mutating base stats directly.

---

## 2. Standard Game Development Workflow

### Step 1: Initialize Master Data (`DataManager`)
```ts
import { DataManager, World, EntityFactory } from '@ryuis/gamecore';

const data = new DataManager();

// 1. Items
data.items.register({
  id: 'sword_iron',
  name: 'Iron Sword',
  category: 'weapon',
  spec: { weaponType: 'sword', attack: 15 },
});

// 2. Skills
data.skills.register({
  id: 'fireball',
  name: 'Fireball',
  mpCost: 10,
  cooldown: 2000,
  targetType: 'single_enemy',
  effects: [{ type: 'damage', basePower: 30, scaling: { attack: 1.2 } }],
});

// 3. Entity Blueprints (Prefabs)
data.blueprints.register({
  id: 'goblin_warrior',
  tags: ['enemy', 'monster'],
  identity: { name: 'Goblin Warrior' },
  stats: { maxHp: 60, attack: 12, defense: 3, speed: 7 },
  skills: ['fireball'],
  inventory: [{ itemId: 'sword_iron', count: 1 }],
  equipment: { weapon: 'sword_iron' },
});
```

### Step 2: Assemble World & Systems
```ts
import {
  World,
  CombatSystem,
  SkillSystem,
  InventorySystem,
  EquipmentSystem,
  StatModSystem,
  ProgressionSystem,
  LootSystem,
  TurnSystem,
  MovementSystem,
} from 'gamecore';

const world = new World();
const statMods = new StatModSystem();

// Register systems needed for your game genre
world.addSystem(new CombatSystem());
world.addSystem(statMods);
world.addSystem(new SkillSystem(undefined, statMods));
world.addSystem(new InventorySystem());
world.addSystem(new EquipmentSystem(data, undefined, statMods));
world.addSystem(new ProgressionSystem());
world.addSystem(new LootSystem());
```

### Step 3: Instantiate Objects with `EntityFactory`
```ts
const factory = new EntityFactory(world, data);

// Standard entity spawn
const enemy = factory.spawn('goblin_warrior');

// Boss or variant override
const boss = factory.spawn('goblin_warrior', {
  name: 'Goblin Chieftain',
  tags: ['boss'],
  overrideStats: { maxHp: 300, attack: 28 },
  extraInventory: [{ itemId: 'rare_gem', count: 1 }],
});

// Field drop item
const droppedItem = factory.createItemEntity('sword_iron', { tags: ['loot'] });
```

---

## 3. Extending with Custom Systems (Runes, Pets, World Tree)

GameCore allows adding project-specific mechanics without modifying core library code via the **5-Step Extension Pattern**:

### Pattern:
1. **Catalog (Optional)**: `data.getOrCreateRegistry('runes').register(...)`
2. **Component**: Create a class extending `Component`
3. **Factory Handler**: Connect blueprint data to the component:
   ```ts
   factory.registerComponentHandler('runes', (entity, runeIds) => {
     entity.add(new RuneComponent(runeIds as string[]));
   });
   ```
4. **System**: Create a class extending `System`:
   * Inject stat bonuses into `StatModsComponent` (`sourceId: 'rune:fire:attack'`)
   * React to game events via `this.bus.on('combat:damage', ...)`
   * Add to world: `world.addSystem(new RuneSystem())`
5. **Persistence**: Register for JSON save/load:
   ```ts
   import { defaultComponentRegistry } from 'gamecore';
   defaultComponentRegistry.register('RuneComponent', RuneComponent);
   ```

### Pets & Companions:
* Pets are standard `Entity` instances (`tags: ['pet', 'ally']`).
* Link to owner with `CompanionComponent({ ownerId: hero.id })`.
* Systems subscribe to `combat:damage` to execute coordinated pet attacks.

### Global / Meta Progression (World Tree, Facilities):
* Create a global entity in the world: `const tree = world.createEntity('world_tree')`.
* Attach `TreeComponent({ level: 5 })`.
* Inject account-wide buffs into spawned heroes via `StatModsComponent` (`sourceId: 'tree:hp'`).

---

## 4. Game Modes: Turn-Based vs Real-Time

### Turn-Based Mode:
Use `TurnSystem` + `TurnComponent`:
```ts
const turn = new TurnSystem();
world.addSystem(turn);

turn.startRound(); // Sorts living entities by speed/initiative descending
const currentActor = turn.currentEntityId;

// End turn and advance
turn.nextTurn();
```

### 2D Grid Movement & Collision:
Use `GridMap` + `MovementSystem` + `PositionComponent`:
```ts
const map = GridMap.fromASCII([
  '####',
  '#..#',
  '####'
], { '#': { type: 'wall', walkable: false }, '.': { type: 'floor', walkable: true } });

const movement = new MovementSystem(map);
world.addSystem(movement);

movement.requestMove(hero.id, 2, 1);
world.update(16); // Checks tile boundaries, walls, and blocking entities
```

---

## 5. Persistence (Save & Load)

```ts
import { WorldSerializer } from 'gamecore';

const serializer = new WorldSerializer();

// 1. Save world to JSON
const saveJson = serializer.toJSON(world);

// 2. Load into a fresh world
const restoredWorld = new World();
serializer.deserialize(saveJson, restoredWorld);
```

---

## 6. Anti-Patterns to Avoid

- ❌ **Direct stat mutation for temporary buffs**: Do NOT do `stats.attack += 10`. Use `statMods.addMod({ entityId, mod: { stat: 'attack', flat: 10, duration: 5000 } })`.
- ❌ **Hardcoded entity creation**: Avoid manual `new StatsComponent()` scattered across game code. Define a Blueprint and call `factory.spawn()`.
- ❌ **Direct inter-system coupling**: Avoid tight imports between systems. Use `world.bus.emit()` and `world.bus.on()`.
