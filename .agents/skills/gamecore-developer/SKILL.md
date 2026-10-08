---
name: gamecore-developer
description: >-
  Architects, develops, and extends games and game systems using the GameCore ECS framework.
  Activate when designing games, building RPG/strategy/roguelike mechanics (combat, skills,
  inventory, equipment, progression, loot tables, turn queues, grid movement), or extending
  GameCore with custom meta systems (e.g. runes, pets, blessings, world tree, mastery).
---

# GameCore Developer Skill

This skill guides the design, implementation, and extension of games built on the **GameCore** framework (`gamecore` package).

GameCore is a platform-agnostic, data-driven, ECS (Entity-Component-System) engine designed so that **data and rules remain invariant** regardless of the frontend interface (Web Canvas, Terminal CLI, React, Mobile).

---

## 1. Core Principles

1. **Components are Pure Data**: Never put business logic, calculations, or methods that alter other entities inside components.
2. **Systems are Pure Logic**: Systems operate on entities queried by component types (`query: ComponentType[]`). Systems should not hold game-state; state belongs in components.
3. **Event-Driven Communication**: Decouple systems using `world.bus.emit()` and `world.bus.on()`.
4. **Data-Driven Prefabs**: Do not hardcode entity construction (`new StatsComponent()`) across your game code. Use `EntityBlueprint` and `EntityFactory.spawn()`.
5. **Unified Stat Modification**: Any buff, debuff, rune, equipment bonus, or talent should use `StatModsComponent` via flat/percent modifiers rather than directly overwriting base stats.

---

## 2. Standard Workflow for Creating a Game

### Step 1: Initialize DataManager & Master Data
Register static game catalogs (items, skills, blueprints) before starting the world.

```ts
import { DataManager, World, EntityFactory } from 'gamecore';

const data = new DataManager();

// Register items
data.items.register({
  id: 'sword_iron',
  name: 'Iron Sword',
  category: 'weapon',
  spec: { weaponType: 'sword', attack: 15 },
});

// Register skills
data.skills.register({
  id: 'fireball',
  name: 'Fireball',
  mpCost: 15,
  cooldown: 2000,
  targetType: 'single_enemy',
  effects: [{ type: 'damage', basePower: 30, scaling: { attack: 1.2 } }],
});

// Register blueprints
data.blueprints.register({
  id: 'goblin',
  tags: ['enemy'],
  identity: { name: 'Goblin' },
  stats: { maxHp: 50, attack: 10, defense: 3, speed: 6 },
  skills: ['fireball'],
  inventory: [{ itemId: 'sword_iron', count: 1 }],
});
```

### Step 2: Assemble World & Required Systems
Add only the systems your game genre needs.

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

world.addSystem(new CombatSystem());
world.addSystem(statMods);
world.addSystem(new SkillSystem(undefined, statMods));
world.addSystem(new InventorySystem());
world.addSystem(new EquipmentSystem(data, undefined, statMods));
world.addSystem(new ProgressionSystem());
world.addSystem(new LootSystem());
```

### Step 3: Spawn Entities with EntityFactory
```ts
const factory = new EntityFactory(world, data);

// Standard spawn
const player = factory.spawn('hero');

// Override spawn (boss variant, elite mob)
const boss = factory.spawn('goblin', {
  name: 'Goblin Warlord',
  tags: ['boss'],
  overrideStats: { maxHp: 300, attack: 25 },
});
```

---

## 3. Extending GameCore with Custom Systems (Runes, Pets, World Tree)

When a game introduces mechanics not built into core, follow the **5-Step Extension Pattern**:

### Pattern:
1. **Catalog (Optional)**: `data.getOrCreateRegistry('runes').register(...)`
2. **Component**: Create a class extending `Component`
3. **Factory Handler**: Bind it to blueprints:
   ```ts
   factory.registerComponentHandler('runes', (entity, runeIds) => {
     entity.add(new RuneComponent(runeIds as string[]));
   });
   ```
4. **System**: Create a class extending `System`:
   * To affect stats, inject modifiers into `StatModsComponent` (`sourceId: 'rune:fire'`)
   * To listen to events, subscribe via `this.bus.on('combat:damage', ...)`
   * Add to world: `world.addSystem(new RuneSystem())`
5. **Persistence**: Register for JSON save/load:
   ```ts
   defaultComponentRegistry.register('RuneComponent', RuneComponent);
   ```

### Pets & Companions:
* Pets are standard `Entity` instances (`tags: ['pet', 'ally']`).
* Connect with an `OwnerComponent({ ownerId: hero.id })`.
* Systems listen to combat events to coordinate follow-up actions.

---

## 4. Turn-Based vs Real-Time Control

### Turn-Based Mode:
Use `TurnSystem` + `TurnComponent`:
```ts
const turn = new TurnSystem();
world.addSystem(turn);

turn.startRound(); // Sorts living entities by speed descending
const actorId = turn.currentEntityId;
// Player/AI executes action...
turn.nextTurn(); // Advances to next living actor
```

### Real-Time / Tick Mode:
Drive execution with `world.update(deltaMs)`. All cooldowns, buff durations, and status effects automatically progress based on `deltaMs`.

---

## 5. Persistence (Save & Load)

```ts
import { WorldSerializer } from 'gamecore';

const serializer = new WorldSerializer();

// Save
const json = serializer.toJSON(world);

// Load
const restoredWorld = new World();
serializer.deserialize(json, restoredWorld);
```

---

## 6. Anti-Patterns to Avoid

- ❌ **Direct stat mutation for temporary buffs**: Do NOT do `stats.attack += 10`. Use `statMods.addMod({ entityId, mod: { stat: 'attack', flat: 10, duration: 5000 } })`.
- ❌ **Hardcoded entity setup**: Avoid manual `new StatsComponent()`, `new InventoryComponent()` inside business code. Always create a Blueprint and use `EntityFactory`.
- ❌ **Direct inter-system coupling**: Do not import system instances into each other if an event can express the intent (`world.bus.emit('stats:died')`).
