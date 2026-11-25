/**
 * GameCore 실전 레퍼런스 데모: 권위 서버 + 클라이언트 예측/롤백 & Cue 연출 동기화
 *
 * 동일한 헤드리스 코어 1개로
 * - Server: CommandBus + FixedStepRunner + WorldDiffer (권위 시뮬레이션)
 * - Client: SnapshotBuffer + 예측 이동/공격 + 미스프리딕션 롤백/재실행 + CueQueue 소비
 * 가 완벽히 결정론적으로 수렴하는 패턴을 보여줍니다.
 */

import {
  GameWorldManager,
  DataManager,
  EntityFactory,
  GridMap,
  PositionComponent,
  StatsComponent,
  StatModsComponent,
  SnapshotBuffer,
  WorldSerializer,
  WorldDiffer,
  WorldInspector,
  CueQueue,
  createCue,
} from '../src';

export function runAuthoritativeArenaDemo() {
  const data = new DataManager({
    items: [
      { id: 'steel_blade', name: '강철 검', category: 'weapon', spec: { weaponType: 'sword', attack: 15 } },
    ],
    skills: [
      {
        id: 'dash_slash',
        name: '돌진 베기',
        mpCost: 10,
        cooldown: 100,
        targetType: 'single_enemy',
        cue: { vfx: 'dash_slash_vfx', sfx: 'blade.wav' },
        effects: [{ type: 'damage', basePower: 30 }],
      },
    ],
    blueprints: [
      {
        id: 'duelist',
        tags: ['player'],
        identity: { name: '결투가' },
        stats: { hp: 120, maxHp: 120, mp: 50, maxMp: 50, attack: 20, defense: 5 },
        skills: ['dash_slash'],
        inventory: [{ itemId: 'steel_blade', count: 1 }],
      },
      {
        id: 'dummy_boss',
        tags: ['enemy', 'boss'],
        identity: { name: '아레나 골렘' },
        stats: { hp: 200, maxHp: 200, attack: 15, defense: 5 },
      },
    ],
  });

  const validation = data.validate();
  if (!validation.valid) {
    throw new Error(`Invalid master data: ${validation.errors.map((e) => e.message).join(', ')}`);
  }

  function bootstrapNode(seed: string) {
    const cues = new CueQueue();
    const mgr = new GameWorldManager({
      seed,
      stepMs: 16,
      data,
      cueQueue: cues,
    });
    mgr.movementSystem!.map = GridMap.fromASCII(['......', '......'], {
      '.': { type: 'floor', walkable: true },
    });

    const factory = new EntityFactory(mgr.world, data);
    const hero = factory.spawn('duelist');
    hero.add(new PositionComponent({ x: 0, y: 0 })).add(new StatModsComponent());
    const boss = factory.spawn('dummy_boss');
    boss.add(new PositionComponent({ x: 4, y: 0 }));

    return { mgr, cues, heroId: hero.id, bossId: boss.id };
  }

  const server = bootstrapNode('arena-seed-777');
  const client = bootstrapNode('arena-seed-777');
  const clientSnapshots = new SnapshotBuffer({ capacity: 32 });
  const serializer = new WorldSerializer();
  const differ = new WorldDiffer();

  // 틱 1~2: 서버·클라이언트 동일 입력 (무기 장착 + 이동)
  const cmd1 = { type: 'equipment:equip' as const, payload: { entityId: server.heroId, slot: 'weapon', itemId: 'steel_blade' }, tick: 1 };
  const cmd2 = { type: 'movement:move' as const, payload: { entityId: server.heroId, targetX: 1, targetY: 0 }, tick: 2 };

  server.mgr.enqueue(cmd1.type, cmd1.payload, { tick: 1 });
  server.mgr.enqueue(cmd2.type, cmd2.payload, { tick: 2 });
  client.mgr.enqueue(cmd1.type, cmd1.payload, { tick: 1 });
  client.mgr.enqueue(cmd2.type, cmd2.payload, { tick: 2 });

  server.mgr.step(1);
  differ.captureSnapshot(server.mgr.world);
  server.mgr.step(1);
  const deltaTick2 = differ.createDelta(server.mgr.world);

  client.mgr.step(1);
  clientSnapshots.capture(1, client.mgr.world, client.mgr.runner);
  client.mgr.step(1);
  clientSnapshots.capture(2, client.mgr.world, client.mgr.runner);

  // 틱 3: 서버에서만 발생한 골렘의 선제 반격(오차 유발) + 틱 4 클라이언트의 미확인 스킬 입력
  const unackedSkill = {
    type: 'skill:use' as const,
    payload: { casterId: client.heroId, skillId: 'dash_slash', targetIds: [client.bossId] },
    tick: 4,
  };

  server.mgr.enqueue('combat:attack', {
    attackerId: server.bossId,
    targetId: server.heroId,
    cue: createCue('hit', { sfx: 'slam.wav' }, server.bossId, server.heroId).payload,
  }, { tick: 3 });
  server.mgr.step(1); // 서버 틱 3 완료
  const serverTick3State = serializer.toJSON(server.mgr.world, { includePrngState: true });
  const serverTick3Hash = server.mgr.world.hash();

  server.mgr.enqueue(unackedSkill.type, unackedSkill.payload, { tick: 4 });
  server.mgr.step(1); // 서버 틱 4 완료

  // 클라이언트는 골렘 반격을 모른 채 틱 3을 빈 틱으로 예측하고 틱 4에 스킬 예측 실행
  client.mgr.step(1);
  clientSnapshots.capture(3, client.mgr.world, client.mgr.runner);
  client.mgr.enqueue(unackedSkill.type, unackedSkill.payload, { tick: 4 });
  client.mgr.step(1);
  clientSnapshots.capture(4, client.mgr.world, client.mgr.runner);

  // 서버 틱 3 권위 스냅샷 수신 -> 롤백 + 미확인 틱 4 스킬 재실행
  const reconcileResult = clientSnapshots.reconcile({
    serverTick: 3,
    serverState: serverTick3State,
    serverHash: serverTick3Hash,
    world: client.mgr.world,
    runner: client.mgr.runner,
    unackedCommands: [unackedSkill],
  });

  const diffAfterReconcile = WorldInspector.diffWorlds(server.mgr.world, client.mgr.world);
  const serverCues = server.cues.flush();

  return {
    reconcileResult,
    diffAfterReconcile,
    deltaTick2,
    serverHeroHp: server.mgr.world.getEntity(server.heroId)!.get(StatsComponent)!.hp,
    clientHeroHp: client.mgr.world.getEntity(client.heroId)!.get(StatsComponent)!.hp,
    serverCuesCount: serverCues.length,
  };
}
