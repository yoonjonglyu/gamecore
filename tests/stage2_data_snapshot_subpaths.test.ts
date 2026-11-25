import { describe, it, expect } from 'vitest';
import {
  DataManager,
  DataValidator,
  SnapshotBuffer,
  GameWorldManager,
  WorldSerializer,
  StatsComponent,
  PositionComponent,
  GridMap,
} from '../src';
import { World as CoreWorld, CommandBus } from '../src/entries/core';
import { CombatSystem } from '../src/entries/combat';
import { FieldOfView } from '../src/entries/spatial';
import { SnapshotBuffer as SerialSnapshotBuffer } from '../src/entries/serialization';
import { BehaviorTreeRunner } from '../src/entries/ai';
import { DataValidator as DataEntryValidator } from '../src/entries/data';

describe('Stage 2: DataValidator, SnapshotBuffer & Subpath Entries', () => {
  describe('DataValidator', () => {
    it('validates clean DataManager bundles without errors', () => {
      const data = new DataManager({
        items: [{ id: 'sword', name: 'Iron Sword', category: 'weapon', stackLimit: 1, value: 100 }],
        skills: [{ id: 'slash', name: 'Slash', mpCost: 10, cooldown: 500, targetType: 'single_enemy', effects: [{ type: 'damage', basePower: 25 }] }],
        blueprints: [
          {
            id: 'knight',
            stats: { hp: 100, maxHp: 100, attack: 15 },
            skills: ['slash'],
            inventory: [{ itemId: 'sword', count: 1 }],
            equipment: { weapon: 'sword' },
            extendedStats: {
              baseStats: { str: 10 },
              definitions: [{ name: 'atk', base: 5, formula: (r) => r.get('str') * 2 }],
            },
          },
        ],
      });

      const report = data.validate();
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.warnings).toEqual([]);
    });

    it('detects missing blueprint references, non-positive counts, hp > maxHp warnings, and formula cycles', () => {
      const data = new DataManager({
        items: [{ id: 'real_item', name: 'Herb', category: 'consumable', stackLimit: 0, value: -5 }],
        skills: [{ id: 'real_skill', name: 'Heal', mpCost: -1, cooldown: 100, targetType: 'self', effects: [{ type: 'status', statusId: 'regen', chance: 1.5, duration: -10 }] }],
        blueprints: [
          {
            id: 'broken_hero',
            stats: { hp: 150, maxHp: 100 },
            skills: ['missing_skill'],
            inventory: [{ itemId: 'missing_item', count: 0 }],
            equipment: { weapon: 'missing_weapon' },
            extendedStats: {
              definitions: [
                { name: 'a', formula: (r) => r.get('b') + 1 },
                { name: 'b', formula: (r) => r.get('a') + 1 },
              ],
            },
          },
        ],
      });

      const report = data.validate();
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.field === 'skills' && e.message.includes('missing_skill'))).toBe(true);
      expect(report.errors.some((e) => e.field === 'inventory' && e.message.includes('missing_item'))).toBe(true);
      expect(report.errors.some((e) => e.field === 'equipment.weapon')).toBe(true);
      expect(report.errors.some((e) => e.field.startsWith('extendedStats.definitions.'))).toBe(true);
      expect(report.errors.some((e) => e.field === 'stackLimit')).toBe(true);
      expect(report.errors.some((e) => e.field === 'effects[0].chance')).toBe(true);
      expect(report.warnings.some((w) => w.field === 'stats.hp')).toBe(true);
    });

    it('validates DialogueTreeData (missing targets & unreachable nodes) and GachaPoolConfig (rates & pity)', () => {
      const dlgReport = DataValidator.validateDialogueTree({
        id: 'dlg1',
        initialNodeId: 'start',
        nodes: {
          start: {
            id: 'start',
            speaker: 'NPC',
            text: 'Hi',
            choices: [{ id: 'c1', text: 'Go', targetNodeId: 'missing_node' }],
          },
          orphan: { id: 'orphan', speaker: 'NPC', text: 'Secret' },
        },
      });
      expect(dlgReport.valid).toBe(false);
      expect(dlgReport.errors.some((e) => e.message.includes('missing_node'))).toBe(true);
      expect(dlgReport.warnings.some((w) => w.field === 'nodes.orphan')).toBe(true);

      const gachaReport = DataValidator.validateGachaPool({
        id: 'banner1',
        tiers: [
          { tier: 'SSR', baseRate: 0.01, items: [] },
          { tier: 'R', baseRate: 0.5, items: ['sword'] },
        ],
        softPityStart: 80,
        hardPityCount: 50,
      });
      expect(gachaReport.valid).toBe(false);
      expect(gachaReport.errors.some((e) => e.field === 'tiers[0].items')).toBe(true);
      expect(gachaReport.errors.some((e) => e.field === 'softPityStart')).toBe(true);
      expect(gachaReport.warnings.some((w) => w.field === 'tiers')).toBe(true);
    });
  });

  describe('SnapshotBuffer & Client Reconciliation', () => {
    function createSim(seed: string) {
      const mgr = new GameWorldManager({ seed, stepMs: 16 });
      mgr.movementSystem!.map = GridMap.fromASCII(['.....', '.....'], {
        '.': { type: 'floor', walkable: true },
      });
      const hero = mgr.world.createEntity('hero');
      hero.add(new PositionComponent({ x: 0, y: 0 })).add(new StatsComponent({ hp: 100, maxHp: 100, attack: 20 }));
      const enemy = mgr.world.createEntity('enemy');
      enemy.add(new PositionComponent({ x: 3, y: 0 })).add(new StatsComponent({ hp: 100, maxHp: 100, defense: 0 }));
      return { mgr, heroId: hero.id, enemyId: enemy.id };
    }

    it('enforces ring buffer capacity eviction and supports capture/restore', () => {
      const sim = createSim('ring');
      const buf = new SnapshotBuffer({ capacity: 3 });

      for (let t = 1; t <= 5; t++) {
        sim.mgr.enqueue('movement:move', { entityId: sim.heroId, targetX: t - 1, targetY: 0 }, { tick: t });
        sim.mgr.step(1);
        buf.capture(sim.mgr.runner.tick, sim.mgr.world, sim.mgr.runner);
      }

      expect(buf.size).toBe(3);
      expect(buf.ticks()).toEqual([3, 4, 5]);
      expect(buf.get(1)).toBeUndefined();
      expect(buf.getNearestBefore(4)?.tick).toBe(4);

      expect(buf.restore(3, sim.mgr.world, sim.mgr.runner)).toBe(true);
      expect(sim.mgr.runner.tick).toBe(3);
      expect(sim.mgr.world.getEntity(sim.heroId)!.get(PositionComponent)!.x).toBe(2);
    });

    it('skips rollback on matching server snapshot and reconciles + replays unacked commands on divergence', () => {
      const server = createSim('recon');
      const client = createSim('recon');
      const buf = new SnapshotBuffer({ capacity: 16 });
      const serializer = new WorldSerializer();

      // Advance both to tick 2 in agreement
      const cmdTick1 = { type: 'movement:move' as const, payload: { entityId: server.heroId, targetX: 1, targetY: 0 }, tick: 1 };
      const cmdTick2 = { type: 'combat:attack' as const, payload: { attackerId: server.heroId, targetId: server.enemyId }, tick: 2 };
      server.mgr.enqueue(cmdTick1.type, cmdTick1.payload, { tick: 1 });
      server.mgr.enqueue(cmdTick2.type, cmdTick2.payload, { tick: 2 });
      client.mgr.enqueue(cmdTick1.type, cmdTick1.payload, { tick: 1 });
      client.mgr.enqueue(cmdTick2.type, cmdTick2.payload, { tick: 2 });

      server.mgr.step(1);
      server.mgr.step(1);
      client.mgr.step(1);
      buf.capture(1, client.mgr.world, client.mgr.runner);
      client.mgr.step(1);
      buf.capture(2, client.mgr.world, client.mgr.runner);

      // Fast-path: server tick 2 matches local buffer
      const fast = buf.reconcile({
        serverTick: 2,
        serverState: serializer.serialize(server.mgr.world, { includePrngState: true }),
        serverHash: server.mgr.world.hash(),
        world: client.mgr.world,
        runner: client.mgr.runner,
      });
      expect(fast.matched).toBe(true);
      expect(fast.rollbackPerformed).toBe(false);

      // Simulate client misprediction at tick 3 (client moved right; server actually gave poison/damage instead) + unacked tick 4 move
      const unackedTick4 = { type: 'movement:move' as const, payload: { entityId: client.heroId, targetX: 2, targetY: 0 }, tick: 4 };

      // Authoritative server: at tick 3 server hero takes 15 damage, at tick 4 receives client's unacked command
      server.mgr.world.getEntity(server.heroId)!.get(StatsComponent)!.hp = 85;
      server.mgr.step(1); // tick 3 on server
      const serverTick3State = serializer.toJSON(server.mgr.world, { includePrngState: true });
      const serverTick3Hash = server.mgr.world.hash();

      server.mgr.enqueue(unackedTick4.type, unackedTick4.payload, { tick: 4 });
      server.mgr.step(1); // tick 4 on server
      const authoritativeTick4Hash = server.mgr.world.hash();

      // Client predicted tick 3 wrong & tick 4 locally without server damage
      client.mgr.enqueue('movement:move', { entityId: client.heroId, targetX: 2, targetY: 1 }, { tick: 3 });
      client.mgr.step(1);
      buf.capture(3, client.mgr.world, client.mgr.runner);
      client.mgr.enqueue(unackedTick4.type, unackedTick4.payload, { tick: 4 });
      client.mgr.step(1);
      buf.capture(4, client.mgr.world, client.mgr.runner);
      expect(client.mgr.world.hash()).not.toBe(authoritativeTick4Hash);

      // Reconcile client against serverTick 3 with unacked tick 4 command
      const res = buf.reconcile({
        serverTick: 3,
        serverState: serverTick3State,
        serverHash: serverTick3Hash,
        world: client.mgr.world,
        runner: client.mgr.runner,
        unackedCommands: [unackedTick4],
      });

      expect(res.matched).toBe(false);
      expect(res.rollbackPerformed).toBe(true);
      expect(res.replayedCommands).toBe(1);
      expect(res.replayedTicks).toBe(1);
      expect(res.finalTick).toBe(4);
      expect(res.finalHash).toBe(authoritativeTick4Hash);
      expect(client.mgr.world.getEntity(client.heroId)!.get(StatsComponent)!.hp).toBe(85);
      expect(client.mgr.world.getEntity(client.heroId)!.get(PositionComponent)!.x).toBe(2);
    });
  });

  it('exposes clean subpath entry barrels', () => {
    expect(CoreWorld).toBeDefined();
    expect(CommandBus).toBeDefined();
    expect(CombatSystem).toBeDefined();
    expect(FieldOfView).toBeDefined();
    expect(SerialSnapshotBuffer).toBe(SnapshotBuffer);
    expect(BehaviorTreeRunner).toBeDefined();
    expect(DataEntryValidator).toBe(DataValidator);
  });
});
