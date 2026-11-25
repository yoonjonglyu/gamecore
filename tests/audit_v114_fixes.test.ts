import { describe, it, expect, vi } from 'vitest';
import {
  World,
  System,
  EventBus,
  Blackboard,
  TimerScheduler,
  WorldSerializer,
  WorldDiffer,
  SaveManager,
  hmacSha256,
  StatsComponent,
  ExtendedStatsComponent,
  StatModsComponent,
  BarrierComponent,
  StatusEffectsComponent,
  SkillsComponent,
  InventoryComponent,
  EquipmentComponent,
  ItemDefComponent,
  ProgressionComponent,
  QuestsComponent,
  PositionComponent,
  HierarchyComponent,
  LootComponent,
  DefaultDamageCalculator,
  CombatSystem,
  SkillSystem,
  StatusEffectSystem,
  StatusReactionRegistry,
  StatModSystem,
  EquipmentSystem,
  LootSystem,
  ProgressionSystem,
  QuestSystem,
  HierarchySystem,
  MovementSystem,
  ConstraintChecker,
  ReplayRecorder,
  ReplayPlayer,
  applyRounding,
  SeededRandom,
  SpatialHashGrid,
  GridMap,
  GridPathfinder,
  FieldOfView,
  ActionNode,
  RepeatNode,
  DialogueSession,
  OfflineProgressEngine,
  GachaEngine,
  DropTable,
  AffixGenerator,
  DataManager,
  EntityFactory,
} from '../src';

describe('v1.1.4 Audit Remediation Regression Suite', () => {
  describe('1. ECS Core Lifecycle, Determinism & Memory Safety', () => {
    it('EventBus.off cancels once() wrappers by original listener reference and cleans empty sets', () => {
      const bus = new EventBus<{ ping: { n: number } }>();
      const fn = vi.fn();

      bus.once('ping', fn);
      expect(bus.listenerCount('ping')).toBe(1);
      bus.off('ping', fn);
      expect(bus.listenerCount('ping')).toBe(0);

      bus.emit('ping', { n: 1 });
      expect(fn).not.toHaveBeenCalled();
    });

    it('Entity.add unbinds replaced components and clear resets entity bindings', () => {
      const world = new World();
      const entity = world.createEntity();
      const first = new StatsComponent({ hp: 50, maxHp: 100 });
      const second = new StatsComponent({ hp: 80, maxHp: 100 });

      entity.add(first);
      expect(first.entityId).toBe(entity.id);

      entity.add(second);
      expect(first.entityId).toBe(-1);
      expect(second.entityId).toBe(entity.id);

      entity.clear();
      expect(second.entityId).toBe(-1);
    });

    it('World.destroy unsubscribes blackboard listener, clears scheduler, and deduplicates addSystem', () => {
      const world = new World();
      class DummySystem extends System {
        readonly query = [];
        update() {}
      }
      const sys = new DummySystem();
      world.addSystem(sys);
      world.addSystem(sys);
      expect(world.hasSystem(DummySystem)).toBe(true);
      expect(world.getSystem(DummySystem)).toBe(sys);
      world.removeSystem(sys);
      expect(world.hasSystem(DummySystem)).toBe(false);

      const timerFn = vi.fn();
      const bbEvents: any[] = [];
      world.bus.on('blackboard:changed', (e) => bbEvents.push(e));
      world.schedule(100, timerFn);
      world.blackboard.set('stage', 1);
      expect(bbEvents.length).toBe(1);

      world.destroy();
      world.blackboard.set('stage', 2);
      expect(bbEvents.length).toBe(1);
      world.update(500);
      expect(timerFn).not.toHaveBeenCalled();
    });

    it('TimerScheduler ignores non-finite/non-positive delta & times <= 0 and isolates callback throws', () => {
      const scheduler = new TimerScheduler();
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const goodFn = vi.fn();
      const zeroTimesFn = vi.fn();

      scheduler.scheduleEvery(0.5, goodFn, 2);
      scheduler.scheduleEvery(10, zeroTimesFn, 0);
      scheduler.schedule(10, () => {
        throw new Error('boom');
      });

      scheduler.update(NaN);
      scheduler.update(-50);
      expect(goodFn).not.toHaveBeenCalled();
      expect(zeroTimesFn).not.toHaveBeenCalled();

      scheduler.update(10);
      expect(goodFn).toHaveBeenCalledTimes(2);
      expect(zeroTimesFn).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('Blackboard.fromRecord clears stale keys and skips duplicate NaN notifications', () => {
      const bb = new Blackboard();
      bb.set('oldKey', 123);
      bb.set('num', NaN);

      const listener = vi.fn();
      bb.subscribe(listener);

      bb.set('num', NaN);
      expect(listener).not.toHaveBeenCalled();

      bb.fromRecord({ freshKey: 'ok' });
      expect(bb.has('oldKey')).toBe(false);
      expect(bb.get('freshKey')).toBe('ok');
    });
  });

  describe('2. Determinism, Canonical World.hash, ComponentRegistry & Serialization', () => {
    it('World.hash produces identical canonical hashes across insertion orders and excludes pending removals', () => {
      const w1 = new World({ seed: 'fixed-seed' });
      const e1 = w1.createEntityWithId(1, ['hero']);
      e1.add(new StatsComponent({ hp: 90, maxHp: 100 }));
      e1.add(new SkillsComponent([{ id: 'slash', name: 'Slash', mpCost: 5, cooldown: 100, targetType: 'single_enemy', effects: [] }]));
      e1.add(new QuestsComponent([{ id: 'q1', title: 'Test', objectives: [{ id: 'o1', type: 'kill', target: 2 }] }]));
      w1.blackboard.set('b', 2);
      w1.blackboard.set('a', 1);

      const w2 = new World({ seed: 'fixed-seed' });
      const e2 = w2.createEntityWithId(1, ['hero']);
      e2.add(new QuestsComponent([{ id: 'q1', title: 'Test', objectives: [{ id: 'o1', type: 'kill', target: 2 }] }]));
      e2.add(new SkillsComponent([{ id: 'slash', name: 'Slash', mpCost: 5, cooldown: 100, targetType: 'single_enemy', effects: [] }]));
      e2.add(new StatsComponent({ hp: 90, maxHp: 100 }));
      w2.blackboard.set('a', 1);
      w2.blackboard.set('b', 2);

      // No Date.now() leakage in QuestsComponent
      expect(e1.get(QuestsComponent)!.getQuest('q1')?.startedAt).toBeUndefined();
      expect(w1.hash()).toBe(w2.hash());

      // Pending removal excluded immediately from hash
      const extra1 = w1.createEntityWithId(2);
      extra1.add(new StatsComponent());
      w1.removeEntity(extra1.id);
      expect(w1.hash()).toBe(w2.hash());
    });

    it('InventoryComponent uses deterministic monotonic slot IDs and atomic capacity checks', () => {
      const inv1 = new InventoryComponent({ maxSlots: 1, maxWeight: 10 });
      const inv2 = new InventoryComponent({ maxSlots: 1, maxWeight: 10 });

      expect(inv1.add('potion', 2, { maxStack: 2 })).toBe(true);
      expect(inv2.add('potion', 2, { maxStack: 2 })).toBe(true);
      expect(inv1.items[0].id).toBe(inv2.items[0].id);

      // Adding a stack that overflows into 2nd slot should fail atomically when maxSlots=1
      expect(inv1.add('potion', 1, { maxStack: 2 })).toBe(false);
      expect(inv1.getQuantity('potion')).toBe(2);
    });

    it('ComponentRegistry round-trips StatusEffects, StatMods, Skills, ItemDef, and Inventory maxWeight', () => {
      const w1 = new World();
      const e = w1.createEntity();
      const statusComp = new StatusEffectsComponent();
      statusComp.apply('burn', 2000, 1, 1, 5, { tickInterval: 500, tickDamage: 10 });
      const modsComp = new StatModsComponent();
      modsComp.add({ sourceId: 'buff1', stat: 'attack', flat: 12, duration: 5000 });

      e.add(statusComp);
      e.add(modsComp);
      e.add(new SkillsComponent([{ id: 'bolt', name: 'Bolt', mpCost: 10, cooldown: 500, targetType: 'single_enemy', effects: [] }]));
      e.add(new ItemDefComponent({ id: 'sword', name: 'Sword', category: 'weapon', value: 100 }));
      e.add(new InventoryComponent({ maxSlots: 5, maxWeight: 42 }));

      const json = new WorldSerializer().toJSON(w1);
      const w2 = new World();
      new WorldSerializer().deserialize(json, w2, { clearWorld: true });

      const restored = w2.getEntity(e.id)!;
      expect(restored.get(StatusEffectsComponent)?.has('burn')).toBe(true);
      expect(restored.get(StatModsComponent)?.compute('attack', 10)).toBe(22);
      expect(restored.get(SkillsComponent)?.knows('bolt')).toBe(true);
      expect(restored.get(ItemDefComponent)?.name).toBe('Sword');
      expect(restored.get(InventoryComponent)?.maxWeight).toBe(42);
    });

    it('SaveManager rejects legacy signatures by default unless allowLegacySignature is true and blocks downgrade/cycle migrations', () => {
      const world = new World();
      world.createEntity().add(new StatsComponent({ hp: 77, maxHp: 100 }));

      // Unpaired surrogate in metadata encodes cleanly and verifies
      const saved = SaveManager.serialize(world, 'secret', 1, { metadata: { note: '\uD800' } });
      const rejected = SaveManager.deserialize(saved, new World(), 'wrong-key');
      expect(rejected.success).toBe(false);
      if (!rejected.success) expect(rejected.tampered).toBe(true);

      const ok = SaveManager.deserialize(saved, new World(), 'secret');
      expect(ok.success).toBe(true);

      // Build a v1.1.0/v1.1.1 legacy payload signed only over data + metadata
      const parsed = JSON.parse(saved);
      const dataStr = JSON.stringify(parsed.data);
      const metaStr = parsed.metadata ? JSON.stringify(parsed.metadata) : '';
      const legacyPayload = dataStr + (metaStr ? `|meta:${metaStr}` : '');
      const legacySig = hmacSha256(legacyPayload, 'secret');
      const legacyEnvelope = JSON.stringify({ ...parsed, checksum: legacySig });

      const rejectLegacy = SaveManager.deserialize(legacyEnvelope, new World(), 'secret');
      expect(rejectLegacy.success).toBe(false);

      const acceptLegacy = SaveManager.deserialize(legacyEnvelope, new World(), 'secret', { allowLegacySignature: true });
      expect(acceptLegacy.success).toBe(true);

      // Migration cycle & downgrade guards
      expect(() => SaveManager.registerMigration(2, 2, (d) => d)).toThrow();
      expect(() => SaveManager.registerMigration(3, 1, (d) => d)).toThrow();

      // Downgrade / future version rejection
      const future = SaveManager.deserialize(
        JSON.stringify({ ...parsed, version: SaveManager.currentVersion + 10 }),
        new World(),
        'secret',
      );
      expect(future.success).toBe(false);
    });

    it('WorldDiffer syncs updatedTags, removedBlackboardKeys, and preserves client blackboard on entity creation', () => {
      const server = new World();
      const differ = new WorldDiffer();
      const e = server.createEntityWithId(1, ['alive']);
      server.blackboard.set('weather', 'rain');
      server.blackboard.set('phase', 1);

      differ.captureSnapshot(server);
      const client = new World();
      client.createEntityWithId(1, ['alive']);
      client.blackboard.set('weather', 'rain');
      client.blackboard.set('localSetting', 'mute');

      e.removeTag('alive');
      e.addTag('dead');
      server.blackboard.delete('weather');
      const spawned = server.createEntityWithId(2, ['npc']);
      spawned.add(new StatsComponent({ hp: 50, maxHp: 50 }));

      const delta = differ.createDelta(server);
      expect(delta.updatedTags?.some((t) => t.entityId === e.id && t.tags.includes('dead'))).toBe(true);
      expect(delta.removedBlackboardKeys).toContain('weather');

      differ.applyDelta(client, delta);

      expect(client.getEntity(1)?.hasTag('dead')).toBe(true);
      expect(client.getEntity(1)?.hasTag('alive')).toBe(false);
      expect(client.blackboard.has('weather')).toBe(false);
      expect(client.blackboard.get('localSetting')).toBe('mute');
    });
  });

  describe('3. Combat, Skills, StatusEffects, Equipment, Constraints, Replay & Quests', () => {
    it('DefaultDamageCalculator uses magicPen for magical attacks & dead attackers cannot deal damage', () => {
      const calc = new DefaultDamageCalculator();
      const dmg = calc.calculate({
        attackerId: 1,
        targetId: 2,
        attackerStats: new StatsComponent({ attack: 100 }),
        targetStats: new StatsComponent({ defense: 20 }),
        rawDamage: 100,
        targetDefense: 20,
        damageType: 'magical',
        armorPen: 0,
        magicPen: 0.5,
        isCritical: false,
        isEvaded: false,
        lifestealRate: 0,
        reflectRate: 0,
        shieldAbsorbed: 0,
        finalDamage: 0,
      });
      // 100 - 20 * (1 - 0.5) = 90
      expect(dmg).toBe(90);

      const world = new World();
      const combat = new CombatSystem();
      world.addSystem(combat);
      const attacker = world.createEntity();
      attacker.add(new StatsComponent({ hp: 0, maxHp: 100, attack: 50 }));
      const target = world.createEntity();
      target.add(new StatsComponent({ hp: 100, maxHp: 100 }));
      target.add(new BarrierComponent({ current: 30, max: 30 }));

      combat.requestAttack({ attackerId: attacker.id, targetId: target.id });
      world.update(16);
      expect(target.get(StatsComponent)!.hp).toBe(100);
      expect(target.get(BarrierComponent)!.current).toBe(30);
    });

    it('SkillSystem rejects passive skills, emits cue:triggered, delegates status without double-tick, and auto-triggers LootSystem on kill', () => {
      const rng = new SeededRandom('skill-test');
      const world = new World({ seed: 'skill-test' });
      const statModSys = new StatModSystem();
      const statusSys = new StatusEffectSystem();
      const progSys = new ProgressionSystem();
      const lootSys = new LootSystem(progSys, rng);
      const skillSys = new SkillSystem(undefined, statModSys, undefined, statusSys, rng);

      world.addSystem(statModSys).addSystem(statusSys).addSystem(progSys).addSystem(skillSys).addSystem(lootSys);

      const hero = world.createEntity();
      hero.add(new StatsComponent({ hp: 100, maxHp: 100, mp: 100, maxMp: 100, attack: 50 }));
      hero.add(new InventoryComponent());
      hero.add(new ProgressionComponent());
      hero.add(new SkillsComponent([
        { id: 'passive_aura', name: 'Aura', mpCost: 0, cooldown: 0, targetType: 'self', passive: true, effects: [] },
        {
          id: 'fire_strike',
          name: 'Fire Strike',
          mpCost: 10,
          cooldown: 1000,
          targetType: 'single_enemy',
          cue: { vfx: 'fire_hit', sfx: 'boom.wav' },
          effects: [
            { type: 'damage', basePower: 60 },
            { type: 'status', statusId: 'burn', duration: 3000, tickInterval: 1000, tickDamage: 5 },
          ],
        },
      ]));

      const goblin = world.createEntity();
      goblin.add(new StatsComponent({ hp: 40, maxHp: 40, defense: 0 }));
      goblin.add(new LootComponent({ exp: 50, items: [{ itemId: 'gem', chance: 1, min: 2, max: 2 }] }));

      const cueEvents: any[] = [];
      world.bus.on('cue:triggered', (c) => cueEvents.push(c));

      const failSpy = vi.fn();
      world.bus.on('skill:failed', failSpy);
      skillSys.useSkill({ casterId: hero.id, skillId: 'passive_aura', targetIds: [hero.id] });
      world.update(16);
      expect(failSpy).toHaveBeenCalled();

      skillSys.useSkill({ casterId: hero.id, skillId: 'fire_strike', targetIds: [goblin.id] });
      world.update(16);

      expect(cueEvents.length).toBe(1);
      expect(cueEvents[0].cue?.payload?.vfx).toBe('fire_hit');
      expect(goblin.get(StatsComponent)!.isDead).toBe(true);
      expect(hero.get(InventoryComponent)!.getQuantity('gem')).toBe(2);
      expect(hero.get(ProgressionComponent)!.currentExp).toBe(50);
    });

    it('StatusEffectSystem catches up multi-interval DoT ticks and guards recursive reactions', () => {
      const world = new World();
      const reactions = new StatusReactionRegistry();
      // Deliberate cycle between A <-> B
      reactions.register({
        id: 'loop1',
        triggers: ['a', 'b'],
        consumeTriggers: false,
        resultStatus: { id: 'a', name: 'A', duration: 1000 },
      });
      const statusSys = new StatusEffectSystem(reactions);
      world.addSystem(statusSys);

      const e = world.createEntity();
      e.add(new StatsComponent({ hp: 100, maxHp: 100 }));
      e.add(new StatusEffectsComponent());

      statusSys.applyStatus(e, 'poison', 5000, 99, 1, 1, { tickInterval: 1000, tickDamage: 10 });
      // Apply recursive triggers without overflowing call stack
      statusSys.applyStatus(e, 'b', 1000, 99);
      statusSys.applyStatus(e, 'a', 1000, 99);

      world.update(3500);
      // 3 ticks of 10 damage = 30 damage -> HP = 70
      expect(e.get(StatsComponent)!.hp).toBe(70);
    });

    it('ExtendedStatsComponent defaults to alive (hp 100), EquipmentSystem allows stackable unequip at cap, and QuestSystem scopes killerId', () => {
      const freshExt = new ExtendedStatsComponent();
      expect(freshExt.hp).toBe(100);
      expect(freshExt.isDead).toBe(false);

      const data = new DataManager();
      data.items.registerMany([
        { id: 'arrow', name: 'Arrow', category: 'consumable', stackLimit: 99 },
      ]);

      const world = new World();
      const eqSys = new EquipmentSystem(data);
      const questSys = new QuestSystem(world);
      world.addSystem(eqSys);

      const hero = world.createEntity();
      const inv = new InventoryComponent({ maxSlots: 1 });
      inv.add('arrow', 10, { maxStack: 99 }); // fills the 1 slot with 10 arrows
      const eq = new EquipmentComponent();
      eq.equip('offhand', { defId: 'arrow' });
      hero.add(inv).add(eq).add(new StatsComponent()).add(new ProgressionComponent());
      hero.add(new QuestsComponent([{
        id: 'kill_quest',
        title: 'Kill Quest',
        objectives: [{ id: 'k1', type: 'kill', target: 1 }],
        rewards: { stats: { attack: 5 } },
      }]));

      eqSys.requestUnequip({ entityId: hero.id, slot: 'offhand' });
      world.update(16);
      // Stackable item merges into existing slot even at maxSlots=1
      expect(eq.isEquipped('offhand')).toBe(false);
      expect(inv.getQuantity('arrow')).toBe(11);

      // Kill attributed to another entity should NOT progress hero's kill quest
      world.bus.emit('stats:died', { entityId: 999, killerId: 888 });
      expect(hero.get(QuestsComponent)!.getQuest('kill_quest')!.objectives[0].current).toBe(0);

      // Kill attributed to hero progresses & completes & rewards stats
      world.bus.emit('stats:died', { entityId: 999, killerId: hero.id });
      const quest = hero.get(QuestsComponent)!.getQuest('kill_quest')!;
      expect(quest.state).toBe('completed');
      questSys.grantReward(hero.id, 'kill_quest');
      expect(hero.get(StatsComponent)!.attack).toBe(15);
    });

    it('ConstraintChecker checks StatMods & ExtendedStats, RoundingPolicy avoids -0, ReplayPlayer records checkpoints cleanly', () => {
      const checker = new ConstraintChecker();
      const world = new World();
      const e = world.createEntity();
      e.add(new StatsComponent({ attack: 10 }));
      const mods = new StatModsComponent();
      mods.add({ sourceId: 'ring', stat: 'attack', flat: 10 });
      e.add(mods);
      expect(checker.check(e, [{ type: 'stat_min', stat: 'attack', value: 20 }]).ok).toBe(true);

      const e2 = world.createEntity();
      e2.add(new ExtendedStatsComponent({ baseStats: { attack: 25 } }));
      expect(checker.check(e2, [{ type: 'stat_min', stat: 'attack', value: 25 }]).ok).toBe(true);

      expect(Object.is(applyRounding(-0.0001, { mode: 'round', decimals: 2 }), 0)).toBe(true);

      const recorder = new ReplayRecorder('seed-1', { timestamp: 12345 });
      recorder.recordAction(1, 'move', { x: 1 });
      recorder.recordCheckpoint(1, 'hash-a');
      const player = new ReplayPlayer(recorder.toJSON());
      const playRes = player.playToEnd(
        () => {},
        () => {},
        () => 'hash-b',
      );
      expect(playRes.desynced).toBe(true);
      expect(playRes.desyncTick).toBe(1);
      expect(playRes.totalActionsExecuted).toBe(1);
      player.reset();
      const stepRes = player.processTick(1, () => {}, () => 'hash-b');
      expect(stepRes.desynced).toBe(true);
      expect(stepRes.expectedHash).toBe('hash-a');
      expect(stepRes.actualHash).toBe('hash-b');
    });

    it('HierarchySystem handles cycles safely and propagates parent-before-child on single tick', () => {
      const world = new World();
      world.addSystem(new HierarchySystem());

      const parent = world.createEntity();
      parent.add(new PositionComponent(10, 20));
      const child = world.createEntity();
      child.add(new PositionComponent(0, 0)).add(new HierarchyComponent({ parentId: parent.id, offsetX: 5, offsetY: 5 }));
      const grand = world.createEntity();
      grand.add(new PositionComponent(0, 0)).add(new HierarchyComponent({ parentId: child.id, offsetX: 2, offsetY: 3 }));

      world.update(16);
      expect(grand.get(PositionComponent)!.x).toBe(17);
      expect(grand.get(PositionComponent)!.y).toBe(28);
    });
  });

  describe('4. Spatial, AI, Dialogue, Idle, Gacha, Data & Factory', () => {
    it('SpatialHashGrid.findNearest handles Infinity radius & MovementSystem isolates collisions by mapId', () => {
      const grid = new SpatialHashGrid({ cellSize: 10 });
      grid.insert(1, 500, 0); // Far beyond cellSize * 5 (= 50)
      expect(grid.findNearest(0, 0, Infinity)?.entityId).toBe(1);
      expect(grid.findNearest(0, 0, 100)).toBeUndefined();

      const world = new World();
      const move = new MovementSystem();
      world.addSystem(move);

      const a = world.createEntity();
      a.add(new PositionComponent({ x: 0, y: 0, mapId: 'floor1' }));
      const b = world.createEntity();
      b.add(new PositionComponent({ x: 1, y: 0, mapId: 'floor2', isBlocked: true }));

      move.requestMove(a.id, 1, 0);
      world.update(16);
      expect(a.get(PositionComponent)!.x).toBe(1);
    });

    it('GridMap.inBounds rejects floats, GridPathfinder blocks diagonal corner-cutting over dynamic obstacles, and FieldOfView guards inputs', () => {
      const map = GridMap.fromASCII(['...', '...', '...'], { '.': { type: 'floor', walkable: true } });
      expect(map.inBounds(1.5, 1)).toBe(false);
      expect(GridMap.fromASCII([], {}).width).toBe(0);

      const smallMap = GridMap.fromASCII(['..', '..'], { '.': { type: 'floor', walkable: true } });
      const res = GridPathfinder.findPath(smallMap, { x: 0, y: 1 }, { x: 1, y: 0 }, {
        allowDiagonal: true,
        extraObstacles: [{ x: 1, y: 1 }, { x: 0, y: 0 }],
      });
      expect(res.found).toBe(false);

      expect(FieldOfView.compute(map, 1.5, 1, 2)).toEqual([]);
      const fov = FieldOfView.compute(map, 0, 0, 3, {
        extraBlocking: [{ x: 1, y: 0 }],
        includeWalls: false,
      });
      expect(fov.some((p) => p.x === 1 && p.y === 0)).toBe(false);
    });

    it('RepeatNode resumes across RUNNING ticks, DialogueSession handles missing initial node, and OfflineProgressEngine preserves overcapped stamina', () => {
      let ticks = 0;
      const node = new RepeatNode(
        new ActionNode(() => {
          ticks++;
          return ticks === 1 ? 'RUNNING' : 'SUCCESS';
        }),
        2,
      );
      expect(node.execute({})).toBe('RUNNING');
      expect(node.execute({})).toBe('SUCCESS');
      expect(ticks).toBe(3);

      const badDlg = new DialogueSession({ id: 'bad', initialNodeId: 'missing', nodes: {} });
      expect(badDlg.isFinished).toBe(true);
      expect(badDlg.currentNodeId).toBe('');

      const idle = OfflineProgressEngine.calculate({
        lastTimestamp: 0,
        currentTimestamp: 10000,
        maxOfflineSeconds: -50,
        stamina: { current: 150, max: 100, secondsPerPoint: 10 },
      });
      expect(idle.appliedSeconds).toBe(0);
      expect(idle.stamina?.next).toBe(150);
      expect(idle.stamina?.recovered).toBe(0);
    });

    it('GachaEngine skips 0-rate tiers and throws descriptively on empty tiers; AffixGenerator supports floats; EntityFactory supports numeric itemId 0 & equipment stats', () => {
      const gacha = new GachaEngine(
        [
          {
            id: 'test',
            tiers: [
              { tier: 'SSR', baseRate: 0, items: ['ssr'] },
              { tier: 'R', baseRate: 1, items: ['r'] },
            ],
            hardPityCount: 0,
          },
        ],
        new SeededRandom('gacha'),
      );
      expect(gacha.pull('test').tier).toBe('R');

      const emptyGacha = new GachaEngine([{ id: 'empty', tiers: [{ tier: 'R', baseRate: 1, items: [] }], hardPityCount: 0 }]);
      expect(() => emptyGacha.pull('empty')).toThrow(/no items configured/);

      const affix = new AffixGenerator();
      affix.registerAffix('rare', { id: 'crit', name: 'Crit', type: 'prefix', stat: 'critRate', minValue: 0.05, maxValue: 0.1 });
      const rolled = affix.generate({ id: 'dag', name: 'Dagger' }, 'rare', new SeededRandom('affix'));
      if (rolled.prefixes.length > 0) {
        expect(rolled.prefixes[0].value).toBeGreaterThanOrEqual(0.05);
        expect(rolled.prefixes[0].value).toBeLessThanOrEqual(0.1);
      }

      const dt = new DropTable('dt', [{ itemId: 'coin', weight: 1, min: 5, max: 2 }]);
      const drops = dt.rollWeighted(1, new SeededRandom('dt'));
      expect(drops[0].quantity).toBeGreaterThanOrEqual(2);
      expect(drops[0].quantity).toBeLessThanOrEqual(5);

      const data = new DataManager();
      data.items.register({ id: 0, name: 'Zero Blade', category: 'weapon', spec: { weaponType: 'sword', attack: 15 } });
      data.blueprints.register({
        id: 'knight',
        extendedStats: { baseStats: { attack: 10 } },
        equipment: { weapon: 0 },
      });
      const world = new World();
      const factory = new EntityFactory(world, data);
      const knight = factory.spawn('knight');
      expect(knight.get(EquipmentComponent)?.getSlot('weapon')?.defId).toBe(0);
      expect(knight.get(ExtendedStatsComponent)?.get('attack')).toBe(25);
    });
  });
});
