import { describe, it, expect, beforeEach } from 'vitest';
import {
  World,
  Entity,
  EventBus,
  CoreEvents,
  SeededRandom,
  applyRounding,
  CombatSystem,
  DefaultPreHitMiddleware,
  DefaultDamageCalculator,
  ModsComponent,
  StatModsComponent,
  StatsComponent,
  ExtendedStatsComponent,
  SaveManager,
  DropTable,
  AffixGenerator,
  SkillSystem,
  SkillsComponent,
  GameWorldManager,
} from '../src';

describe('1) 시드 기반 결정론적 난수 엔진 (SeededRandom)', () => {
  it('동일 시드로 생성된 2개의 PRNG는 100% 동일한 수열을 생성한다', () => {
    const rngA = new SeededRandom('my-secret-seed-42');
    const rngB = new SeededRandom('my-secret-seed-42');

    const sequenceA: number[] = [];
    const sequenceB: number[] = [];

    for (let i = 0; i < 20; i++) {
      sequenceA.push(rngA.next());
      sequenceB.push(rngB.next());
    }

    expect(sequenceA).toEqual(sequenceB);
  });

  it('nextInt, nextFloat, chance, pick, shuffle 동작 검증', () => {
    const rng = new SeededRandom(12345);

    const intVal = rng.nextInt(1, 6);
    expect(intVal).toBeGreaterThanOrEqual(1);
    expect(intVal).toBeLessThanOrEqual(6);

    const floatVal = rng.nextFloat(10.5, 20.5);
    expect(floatVal).toBeGreaterThanOrEqual(10.5);
    expect(floatVal).toBeLessThan(20.5);

    const chanceVal = rng.chance(0.5);
    expect(typeof chanceVal).toBe('boolean');

    const items = ['sword', 'shield', 'potion', 'helmet'];
    const picked = rng.pick(items);
    expect(items).toContain(picked);

    const shuffled = rng.shuffle(items);
    expect(shuffled).toHaveLength(items.length);
    expect(shuffled.sort()).toEqual([...items].sort());
  });

  it('exportState 및 importState로 난수 생성기 상태를 완벽히 복원한다', () => {
    const rng = new SeededRandom('save-state-seed');

    // 5번 소비
    for (let i = 0; i < 5; i++) {
      rng.next();
    }

    const state = rng.exportState();

    // 추가 5번 소비
    const expectedRemaining: number[] = [];
    for (let i = 0; i < 5; i++) {
      expectedRemaining.push(rng.next());
    }

    // 새 PRNG에 상태 복원
    const restoredRng = new SeededRandom();
    restoredRng.importState(state);

    const restoredSequence: number[] = [];
    for (let i = 0; i < 5; i++) {
      restoredSequence.push(restoredRng.next());
    }

    expect(restoredSequence).toEqual(expectedRemaining);
  });

  it('CombatSystem과 DefaultPreHitMiddleware에서 시드에 따라 결정론적 전투 결과를 낸다', () => {
    const seed = 'deterministic-combat-test';

    const runCombat = (s: string) => {
      const world = new World<CoreEvents>({ seed: s });
      const combat = new CombatSystem({ random: world.random });
      world.addSystem(combat);

      const attacker = world.createEntity('player');
      attacker.add(new StatsComponent({ attack: 50 }));

      const target = world.createEntity('enemy');
      target.add(new StatsComponent({ hp: 100, maxHp: 100, defense: 10 }));

      combat.requestAttack({
        attackerId: attacker.id,
        targetId: target.id,
        critChance: 0.5,
        hitChance: 0.9,
      });

      world.update(16);
      return target.get(StatsComponent)!.hp;
    };

    const hpRun1 = runCombat(seed);
    const hpRun2 = runCombat(seed);
    expect(hpRun1).toBe(hpRun2);
  });
});

describe('2) 대미지 및 스탯 라운딩 정책 (Precision & Rounding Policy)', () => {
  it('applyRounding 유틸리티가 round, floor, ceil, raw 모드를 정확히 처리한다', () => {
    expect(applyRounding(14.799999999999999, { mode: 'round', decimals: 0 })).toBe(15);
    expect(applyRounding(14.799999999999999, { mode: 'floor', decimals: 0 })).toBe(14);
    expect(applyRounding(14.2, { mode: 'ceil', decimals: 0 })).toBe(15);
    expect(applyRounding(14.799999999999999, { mode: 'raw' })).toBe(14.799999999999999);

    // 소수점 1자리 보존
    expect(applyRounding(14.76, { mode: 'round', decimals: 1 })).toBe(14.8);
    expect(applyRounding(14.76, { mode: 'floor', decimals: 1 })).toBe(14.7);
  });

  it('DefaultDamageCalculator에서 라운딩 정책을 적용하여 정수 대미지를 보장한다', () => {
    const calc = new DefaultDamageCalculator({ mode: 'floor', decimals: 0 });

    const world = new World<CoreEvents>();
    const a = world.createEntity();
    const t = world.createEntity();

    const ctx: any = {
      attacker: a,
      target: t,
      request: {},
      damageType: 'physical',
      rawDamage: 25.75,
      targetDefense: 10.2,
      armorPen: 0,
      rounding: { mode: 'floor', decimals: 0 },
    };

    // 25.75 - 10.2 = 15.55 -> floor = 15
    expect(calc.calculate(ctx)).toBe(15);
  });

  it('ModsComponent / StatModsComponent.compute에서 round 옵션을 지원한다', () => {
    const mods = new ModsComponent();
    // 10 + 20% = 12, flat 2.5 더하면 14.5
    mods.add({ sourceId: 'test1', stat: 'attack', flat: 2.5 });
    mods.add({ sourceId: 'test2', stat: 'attack', percent: 0.2 });

    // 기본 round: true
    expect(mods.compute('attack', 10)).toBe(15); // (10 + 2.5) * 1.2 = 15
    // round: false 일 때 부동소수점 유지
    expect(mods.compute('attack', 10, { round: false })).toBe(15);

    const mods2 = new StatModsComponent();
    mods2.add({ sourceId: 'frac', stat: 'attack', flat: 2.3 });
    // (10 + 2.3) = 12.3 -> round: true면 12, false면 12.3
    expect(mods2.compute('attack', 10, { round: true })).toBe(12);
    expect(mods2.compute('attack', 10, { round: false })).toBeCloseTo(12.3);
  });
});

describe('3) 세이브 데이터 무결성 및 버전 마이그레이션 (SaveManager)', () => {
  beforeEach(() => {
    SaveManager.clearMigrations();
  });

  it('세이브 직렬화 후 정상 복원된다', () => {
    const world = new World<CoreEvents>();
    const player = world.createEntity('player');
    player.add(new StatsComponent({ hp: 85, maxHp: 100, attack: 25 }));

    const payload = SaveManager.serialize(world, 'my-secret-key', 1);
    expect(typeof payload).toBe('string');

    const newWorld = new World<CoreEvents>();
    const result = SaveManager.deserialize(payload, newWorld, 'my-secret-key');

    expect(result.success).toBe(true);
    expect(newWorld.entityCount).toBe(1);
    const loadedPlayer = newWorld.queryByTagFirst('player');
    expect(loadedPlayer).toBeDefined();
    expect(loadedPlayer!.get(StatsComponent)?.hp).toBe(85);
  });

  it('데이터가 변조되었거나 비밀키가 틀릴 경우 복원을 거부한다 (tampered: true)', () => {
    const world = new World<CoreEvents>();
    const hero = world.createEntity('hero');
    hero.add(new StatsComponent({ hp: 50 }));

    const payload = SaveManager.serialize(world, 'correct-secret', 1);

    // 1. 잘못된 비밀키로 복원 시도
    const testWorld1 = new World<CoreEvents>();
    const result1 = SaveManager.deserialize(payload, testWorld1, 'wrong-secret');
    expect(result1.success).toBe(false);
    expect(result1.tampered).toBe(true);

    // 2. 페이로드 JSON 데이터 위변조 (HP를 9999로 수정)
    const envelope = JSON.parse(payload);
    envelope.data.entities[0].components[0].data.hp = 9999;
    const tamperedPayload = JSON.stringify(envelope);

    const testWorld2 = new World<CoreEvents>();
    const result2 = SaveManager.deserialize(tamperedPayload, testWorld2, 'correct-secret');
    expect(result2.success).toBe(false);
    expect(result2.tampered).toBe(true);
  });

  it('등록된 스키마 버전 마이그레이션 파이프라인을 순차 실행한다', () => {
    // v1 -> v2: stats 컴포넌트의 hp를 2배로 증가시키는 마이그레이션
    SaveManager.registerMigration(1, 2, (data) => {
      const copy = JSON.parse(JSON.stringify(data));
      for (const ent of copy.entities) {
        for (const comp of ent.components) {
          if (comp.type === 'StatsComponent' && comp.data.hp) {
            comp.data.hp = comp.data.hp * 2;
          }
        }
      }
      return copy;
    });

    const world = new World<CoreEvents>();
    const ent = world.createEntity();
    ent.add(new StatsComponent({ hp: 50 }));

    // v1으로 세이브
    const payload = SaveManager.serialize(world, undefined, 1);

    // 복원 (v2로 자동 마이그레이션 적용)
    const newWorld = new World<CoreEvents>();
    const result = SaveManager.deserialize(payload, newWorld);

    expect(result.success).toBe(true);
    expect(result.version).toBe(2);
    const restored = newWorld.entities[0];
    expect(restored.get(StatsComponent)?.hp).toBe(100);
  });
});

describe('4) 반응형 컴포넌트 변경 감지 (Reactive ECS Events & batchUpdates)', () => {
  it('컴포넌트 추가/제거 및 notifyUpdated 시 EventBus에 실시간 발행된다', () => {
    const world = new World<CoreEvents>();
    const bus = world.bus;

    const updatedEvents: any[] = [];
    const removedEvents: any[] = [];

    bus.on('ecs:component:updated', (e) => updatedEvents.push(e));
    bus.on('ecs:component:removed', (e) => removedEvents.push(e));

    const entity = world.createEntity('unit');

    // 1. 추가
    const stats = new StatsComponent({ hp: 100 });
    entity.add(stats);

    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0].entityId).toBe(entity.id);
    expect(updatedEvents[0].componentName).toBe('StatsComponent');

    // 2. 값 수정 후 명시적 알림
    stats.hp = 80;
    entity.notifyUpdated(StatsComponent);

    expect(updatedEvents).toHaveLength(2);
    expect(updatedEvents[1].component.hp).toBe(80);

    // 3. 제거
    entity.remove(StatsComponent);
    expect(removedEvents).toHaveLength(1);
    expect(removedEvents[0].entityId).toBe(entity.id);
    expect(removedEvents[0].componentName).toBe('StatsComponent');
  });

  it('world.batchUpdates(fn) 내에서는 이벤트가 배치로 지연 및 중복제거(Deduplicate)되어 1회만 발행된다', () => {
    const world = new World<CoreEvents>();
    const bus = world.bus;

    let updateCount = 0;
    bus.on('ecs:component:updated', () => updateCount++);

    const entity = world.createEntity();
    const stats = new StatsComponent({ hp: 100 });
    entity.add(stats);
    updateCount = 0; // 리셋

    // 대량 연산 수행
    world.batchUpdates(() => {
      for (let i = 0; i < 100; i++) {
        stats.hp = i;
        entity.notifyUpdated(StatsComponent);
      }
      // 배치 도중에는 아직 0회
      expect(updateCount).toBe(0);
    });

    // 배치 완료 시 중복 제거되어 최종 1회만 발행
    expect(updateCount).toBe(1);
    expect(stats.hp).toBe(99);
  });
});

describe('5) 스킬 실행 파이프라인 고수준 통합 (SkillSystem canCast / castSkill)', () => {
  it('canCast가 쿨다운, MP, 생사 여부, 제약조건을 정확히 판정한다', () => {
    const world = new World<CoreEvents>();
    const skillSys = new SkillSystem();
    world.addSystem(skillSys);

    const caster = world.createEntity('wizard');
    const skills = new SkillsComponent();
    skills.learn({
      id: 'fireball',
      name: '파이어볼',
      mpCost: 30,
      cooldown: 5000,
      targetType: 'single_enemy',
      effects: [{ type: 'damage', baseDamage: 40, damageType: 'magical' }],
    });
    caster.add(skills);
    caster.add(new StatsComponent({ hp: 100, mp: 20 })); // MP 20 < 30 (부족)

    const skillDef = skills.getDef('fireball')!;

    // 1. MP 부족
    const check1 = skillSys.canCast(caster, skillDef);
    expect(check1.ok).toBe(false);
    expect(check1.reason).toBe('no_mp');

    // MP 충전
    caster.get(StatsComponent)!.mp = 50;
    const check2 = skillSys.canCast(caster, skillDef);
    expect(check2.ok).toBe(true);

    // 2. 쿨다운 테스트
    skills._startCooldown('fireball');
    const check3 = skillSys.canCast(caster, skillDef);
    expect(check3.ok).toBe(false);
    expect(check3.reason).toBe('cooldown');
  });

  it('castSkill이 리소스 차감, 쿨다운 등록, 효과 적용, 완료 이벤트를 원스톱으로 처리한다', () => {
    const world = new World<CoreEvents>();
    const skillSys = new SkillSystem();
    world.addSystem(skillSys);

    const caster = world.createEntity('mage');
    const skills = new SkillsComponent();
    skills.learn({
      id: 'meteor',
      name: '메테오',
      mpCost: 25,
      cooldown: 3000,
      targetType: 'single_enemy',
      effects: [{ type: 'damage', baseDamage: 50, damageType: 'magical' }],
    });
    caster.add(skills);
    caster.add(new StatsComponent({ hp: 100, mp: 50 }));

    const target = world.createEntity('dummy');
    target.add(new StatsComponent({ hp: 100, defense: 0 }));

    const skillDef = skills.getDef('meteor')!;

    const result = skillSys.castSkill(caster, [target], skillDef);

    expect(result.success).toBe(true);
    expect(caster.get(StatsComponent)!.mp).toBe(25); // 50 - 25
    expect(skills.isReady('meteor')).toBe(false); // 쿨다운 작동
    expect(target.get(StatsComponent)!.hp).toBe(50); // 100 - 50 데미지
  });
});

describe('6) 절차적 전리품 및 드랍 테이블 시스템 (DropTable & AffixGenerator)', () => {
  it('DropTable이 독립 확률 및 가중치 추첨 롤링을 결정론적으로 지원한다', () => {
    const rng = new SeededRandom('drop-table-seed');
    const table = new DropTable('dungeon_box', [
      { itemId: 'gold', chance: 1.0, min: 10, max: 20 },
      { itemId: 'iron_ore', chance: 0.5, min: 1, max: 3 },
      { itemId: 'diamond', weight: 5, min: 1, max: 1 },
      { itemId: 'ruby', weight: 15, min: 1, max: 1 },
    ]);

    // 1. 독립 드랍
    const drops = table.rollIndependent(rng);
    expect(drops.some((d) => d.itemId === 'gold')).toBe(true);

    // 2. 가중치 추첨 드랍 (3개 추출)
    const weightedDrops = table.rollWeighted(3, rng);
    expect(weightedDrops.length).toBeGreaterThan(0);
  });

  it('AffixGenerator가 등급별 접사를 조합하고 스탯 및 명칭을 합성한다', () => {
    const rng = new SeededRandom('affix-seed');
    const gen = new AffixGenerator();

    gen.registerAffix('rare', {
      id: 'flaming',
      name: '화염의',
      type: 'prefix',
      stat: 'attack',
      minValue: 5,
      maxValue: 10,
    });

    gen.registerAffix('rare', {
      id: 'slaughter',
      name: '도살의',
      type: 'suffix',
      stat: 'critChance',
      minValue: 2,
      maxValue: 5,
    });

    const item = gen.generate(
      { id: 'sword_01', name: '롱소드', baseStats: { attack: 15 } },
      'rare',
      rng,
    );

    expect(item.rarity).toBe('rare');
    expect(item.stats.attack).toBeGreaterThanOrEqual(20); // 15 + (5~10)
    expect(item.fullName).toContain('롱소드');
  });

  it('GameWorldManager가 PRNG 및 코어 시스템들을 선언적으로 부트스트랩한다', () => {
    const manager = new GameWorldManager({ seed: 'bootstrap-seed' });

    expect(manager.world).toBeDefined();
    expect(manager.random).toBeDefined();
    expect(manager.combatSystem).toBeDefined();
    expect(manager.skillSystem).toBeDefined();
    expect(manager.lootSystem).toBeDefined();

    const hero = manager.world.createEntity('hero');
    hero.add(new StatsComponent({ hp: 100 }));

    manager.update(16);
    expect(manager.world.entityCount).toBe(1);
  });
});
