import { performance } from 'node:perf_hooks';
import {
  World,
  GameWorldManager,
  StatsComponent,
  PositionComponent,
  SpatialHashGrid,
  WorldDiffer,
} from '../src';

interface BenchResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
}

function runBench(name: string, fn: () => void, iterations = 1000, warmup = 100): BenchResult {
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const totalMs = Math.max(0.001, performance.now() - start);
  const avgMs = totalMs / iterations;
  const opsPerSec = Math.round((iterations / totalMs) * 1000);

  return { name, iterations, totalMs, avgMs, opsPerSec };
}

function main(): void {
  const results: BenchResult[] = [];

  // 1. ECS queryEntities (1000 entities)
  const entityWorld = new World({ seed: 'bench-ecs' });
  for (let i = 0; i < 1000; i++) {
    entityWorld
      .createEntity('unit')
      .add(new StatsComponent({ hp: 100, maxHp: 100 }))
      .add(new PositionComponent({ x: i % 100, y: Math.floor(i / 100) }));
  }
  results.push(
    runBench(
      'ECS queryEntities (1000 entities)',
      () => {
        entityWorld.queryEntities([StatsComponent, PositionComponent]);
      },
      2000,
    ),
  );

  // 2. SpatialHashGrid queryRadius (1000 entities)
  const grid = new SpatialHashGrid({ cellSize: 50 });
  for (let i = 0; i < 1000; i++) {
    grid.insert(i, (i * 17) % 1000, (i * 31) % 1000);
  }
  results.push(
    runBench(
      'SpatialHashGrid queryRadius (1000 entities)',
      () => {
        grid.queryRadius(500, 500, 120);
      },
      2000,
    ),
  );

  // 3. World.hash() (100 entities)
  const hashWorld = new World({ seed: 'bench-hash' });
  for (let i = 0; i < 100; i++) {
    hashWorld
      .createEntity('hero')
      .add(new StatsComponent({ hp: 100, maxHp: 100 }))
      .add(new PositionComponent({ x: i, y: i }));
  }
  results.push(
    runBench(
      'World.hash() (100 entities)',
      () => {
        hashWorld.hash();
      },
      200,
      20,
    ),
  );

  // 4. WorldDiffer.createDelta() (100 unchanged entities)
  const differ = new WorldDiffer();
  differ.captureSnapshot(hashWorld);
  results.push(
    runBench(
      'WorldDiffer.createDelta() (100 entities)',
      () => {
        differ.createDelta(hashWorld);
      },
      300,
      30,
    ),
  );

  // 5. CommandBus + FixedStepRunner.step(1)
  const mgr = new GameWorldManager({ seed: 'bench-runner', stepMs: 16 });
  const a = mgr.world.createEntity().add(new StatsComponent({ hp: 100000, maxHp: 100000, attack: 5 }));
  const b = mgr.world.createEntity().add(new StatsComponent({ hp: 100000, maxHp: 100000 }));
  results.push(
    runBench(
      'CommandBus + FixedStepRunner.step(1)',
      () => {
        mgr.enqueue('combat:attack', { attackerId: a.id, targetId: b.id });
        mgr.step(1);
        b.get(StatsComponent)!.hp = 100000;
      },
      1000,
    ),
  );

  console.log(`\nGameCore Benchmarks (Node ${process.version})`);
  console.log('---------------------------------------------------------------------');
  for (const r of results) {
    console.log(
      `${r.name.padEnd(44)} | ${String(r.opsPerSec).padStart(8)} ops/s | ${r.avgMs.toFixed(4)} ms/op`,
    );
  }
  console.log('---------------------------------------------------------------------');
}

main();
