import { describe, it, expect } from 'vitest';
import {
  GameWorldManager,
  SeededRandom,
  StatsComponent,
  SkillsComponent,
  InventoryComponent,
  PositionComponent,
  FSMComponent,
  GridMap,
} from '../src';

function setupFuzzScenario(seed: string | number) {
  const mgr = new GameWorldManager({
    seed,
    stepMs: 16,
    rounding: { mode: 'round', decimals: 2 },
  });

  mgr.movementSystem!.map = GridMap.fromASCII(
    [
      '......',
      '.#....',
      '....#.',
      '......',
    ],
    {
      '.': { type: 'floor', walkable: true },
      '#': { type: 'wall', walkable: false },
    },
  );

  const hero = mgr.world.createEntity('hero');
  hero
    .add(new PositionComponent({ x: 0, y: 0 }))
    .add(new StatsComponent({ hp: 500, maxHp: 500, mp: 300, maxMp: 300, attack: 18, defense: 4, critRate: 0.25 }))
    .add(new InventoryComponent({ maxSlots: 20 }))
    .add(
      new FSMComponent({
        initialState: 'idle',
        states: {
          idle: { canMove: true, canCast: true, canAttack: true, allowedTransitions: ['focus'] },
          focus: { canMove: true, canCast: true, canAttack: true, duration: 32, autoTransitionTo: 'idle' },
        },
      }),
    )
    .add(
      new SkillsComponent([
        {
          id: 'spark',
          name: 'Spark',
          mpCost: 8,
          cooldown: 48,
          targetType: 'single_enemy',
          effects: [{ type: 'damage', basePower: 14 }],
        },
      ]),
    );

  const monster = mgr.world.createEntity('monster');
  monster
    .add(new PositionComponent({ x: 4, y: 3 }))
    .add(new StatsComponent({ hp: 500, maxHp: 500, mp: 200, maxMp: 200, attack: 12, defense: 3, critRate: 0.15 }))
    .add(new InventoryComponent({ maxSlots: 20 }))
    .add(
      new FSMComponent({
        initialState: 'idle',
        states: {
          idle: { canMove: true, canCast: true, canAttack: true, allowedTransitions: ['focus'] },
          focus: { canMove: true, canCast: true, canAttack: true, duration: 32, autoTransitionTo: 'idle' },
        },
      }),
    );

  return { mgr, heroId: hero.id, monsterId: monster.id };
}

interface GeneratedCmd {
  tick: number;
  type: 'combat:attack' | 'skill:use' | 'movement:move' | 'inventory:add' | 'fsm:transition';
  payload: any;
}

function generateCommandStream(streamSeed: string, totalTicks: number, heroId: number, monsterId: number): GeneratedCmd[] {
  const fuzzRng = new SeededRandom(streamSeed);
  const commands: GeneratedCmd[] = [];

  for (let tick = 1; tick <= totalTicks; tick++) {
    const count = fuzzRng.nextInt(1, 2);
    for (let j = 0; j < count; j++) {
      const kind = fuzzRng.nextInt(0, 4);
      const actor = fuzzRng.chance(0.6) ? heroId : monsterId;
      const target = actor === heroId ? monsterId : heroId;

      switch (kind) {
        case 0:
          commands.push({ tick, type: 'combat:attack', payload: { attackerId: actor, targetId: target } });
          break;
        case 1:
          if (actor === heroId) {
            commands.push({ tick, type: 'skill:use', payload: { casterId: heroId, skillId: 'spark', targetIds: [monsterId] } });
          } else {
            commands.push({ tick, type: 'combat:attack', payload: { attackerId: actor, targetId: target } });
          }
          break;
        case 2:
          commands.push({
            tick,
            type: 'movement:move',
            payload: { entityId: actor, targetX: fuzzRng.nextInt(0, 5), targetY: fuzzRng.nextInt(0, 3) },
          });
          break;
        case 3:
          commands.push({
            tick,
            type: 'inventory:add',
            payload: { entityId: actor, itemId: fuzzRng.pick(['herb', 'ore', 'coin']), quantity: fuzzRng.nextInt(1, 3) },
          });
          break;
        case 4:
          commands.push({
            tick,
            type: 'fsm:transition',
            payload: { entityId: actor, nextState: 'focus' },
          });
          break;
      }
    }
  }
  return commands;
}

describe('Determinism Property Verification Suite (v1.2.0)', () => {
  it('Property 1: identical seed + random command stream yields identical world.hash() on every tick across 30 seeds', () => {
    for (let s = 0; s < 30; s++) {
      const seed = `prop-twin-${s}`;
      const a = setupFuzzScenario(seed);
      const b = setupFuzzScenario(seed);
      const cmds = generateCommandStream(`fuzz-${s}`, 60, a.heroId, a.monsterId);

      for (const cmd of cmds) {
        a.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
        b.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
      }

      for (let tick = 1; tick <= 60; tick++) {
        a.mgr.step(1);
        b.mgr.step(1);
        expect(a.mgr.world.hash()).toBe(b.mgr.world.hash());
      }
    }
  });

  it('Property 2: variable frame-rate advance() invariance (16ms vs 8ms vs jittery deltas) across 15 seeds', () => {
    const TOTAL_TICKS = 40;
    const TARGET_MS = TOTAL_TICKS * 16;

    for (let s = 0; s < 15; s++) {
      const seed = `prop-fps-${s}`;
      const r60 = setupFuzzScenario(seed);
      const r120 = setupFuzzScenario(seed);
      const rJitter = setupFuzzScenario(seed);

      const cmds = generateCommandStream(`fps-cmds-${s}`, TOTAL_TICKS, r60.heroId, r60.monsterId);
      for (const cmd of cmds) {
        r60.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
        r120.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
        rJitter.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
      }

      // 60Hz loop
      for (let t = 0; t < TARGET_MS; t += 16) {
        r60.mgr.advance(16);
      }
      // 120Hz loop
      for (let t = 0; t < TARGET_MS; t += 8) {
        r120.mgr.advance(8);
      }
      // Jittery loop (5..37ms deltas summing exactly to TARGET_MS)
      const frameRng = new SeededRandom(`frames-${s}`);
      let remaining = TARGET_MS;
      while (remaining > 0) {
        const dt = Math.min(remaining, frameRng.nextInt(5, 37));
        remaining -= dt;
        rJitter.mgr.advance(dt);
      }

      expect(r60.mgr.runner.tick).toBe(TOTAL_TICKS);
      expect(r120.mgr.runner.tick).toBe(TOTAL_TICKS);
      expect(rJitter.mgr.runner.tick).toBe(TOTAL_TICKS);

      const hash60 = r60.mgr.world.hash();
      expect(r120.mgr.world.hash()).toBe(hash60);
      expect(rJitter.mgr.world.hash()).toBe(hash60);
    }
  });

  it('Property 3: mid-run Save/Load + runner state resume equals uninterrupted simulation across 20 seeds', () => {
    for (let s = 0; s < 20; s++) {
      const seed = `prop-save-${s}`;
      const continuous = setupFuzzScenario(seed);
      const splitA = setupFuzzScenario(seed);

      const cmds = generateCommandStream(`save-cmds-${s}`, 60, continuous.heroId, continuous.monsterId);
      for (const cmd of cmds) {
        continuous.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
        splitA.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
      }

      continuous.mgr.step(60);

      // Run splitA to tick 30, save world + PRNG + runner state
      splitA.mgr.step(30);
      const savePayload = splitA.mgr.save('save-key', { includePrngState: true });
      const runnerState = splitA.mgr.runner.exportState();

      // Resume in fresh manager for ticks 31..60
      const splitB = setupFuzzScenario('placeholder-will-be-overwritten');
      const loadRes = splitB.mgr.load(savePayload, 'save-key', { clearWorld: true });
      expect(loadRes.success).toBe(true);
      splitB.mgr.runner.importState(runnerState);

      for (const cmd of cmds) {
        if (cmd.tick > 30) {
          splitB.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
        }
      }
      splitB.mgr.step(30);

      expect(splitB.mgr.runner.tick).toBe(60);
      expect(splitB.mgr.world.hash()).toBe(continuous.mgr.world.hash());
    }
  });

  it('Property 4: auto-recorded command replay matches live run checkpoints across 15 seeds', () => {
    for (let s = 0; s < 15; s++) {
      const seed = `prop-replay-${s}`;
      const live = setupFuzzScenario(seed);
      live.mgr.startRecording({ checkpointInterval: 5 });

      const cmds = generateCommandStream(`rep-cmds-${s}`, 50, live.heroId, live.monsterId);
      for (const cmd of cmds) {
        live.mgr.enqueue(cmd.type, cmd.payload, { tick: cmd.tick });
      }
      live.mgr.step(50);

      const expectedHash = live.mgr.world.hash();
      const replayData = live.mgr.stopRecording()!;
      expect(replayData.checkpoints.length).toBe(10);

      const playback = setupFuzzScenario(seed);
      const res = playback.mgr.runner.replay(replayData);
      expect(res.completed).toBe(true);
      expect(res.desynced).toBe(false);
      expect(playback.mgr.world.hash()).toBe(expectedHash);
    }
  });
});
