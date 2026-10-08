import { describe, it, expect, vi } from 'vitest';
import {
  World,
  StatsComponent,
  StatModsComponent,
  StatModSystem,
  SkillSystem,
  SkillsComponent,
  CoreEvents,
  SkillDef,
} from '../src/index';

// ─── 샘플 데이터 ──────────────────────────────────────────────────────────────

const rageSkill: SkillDef = {
  id: 'rage',
  name: '분노',
  mpCost: 10,
  cooldown: 0,
  targetType: 'self',
  effects: [
    { type: 'stat_mod', stat: 'attack', flat: 30, duration: 3000 },
  ],
};

const weakenSkill: SkillDef = {
  id: 'weaken',
  name: '약화',
  mpCost: 10,
  cooldown: 0,
  targetType: 'single_enemy',
  effects: [
    { type: 'stat_mod', stat: 'defense', flat: -10, duration: 2000 },
    { type: 'stat_mod', stat: 'attack', percent: -0.2, duration: 2000 },
  ],
};

// ─── StatModsComponent 단위 테스트 ────────────────────────────────────────────

describe('StatModsComponent', () => {
  it('flat 변화 — compute가 기본값에 더한다', () => {
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'rage', stat: 'attack', flat: 30 });
    expect(mods.compute('attack', 10)).toBe(40);
  });

  it('percent 변화 — compute가 배율을 적용한다', () => {
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'buff', stat: 'attack', percent: 0.5 }); // +50%
    expect(mods.compute('attack', 100)).toBe(150);
  });

  it('flat + percent 복합 — flat 먼저, 그다음 percent', () => {
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'combo', stat: 'attack', flat: 20, percent: 0.1 }); // (100+20)*1.1=132
    expect(mods.compute('attack', 100)).toBe(132);
  });

  it('디버프 — 음수 flat 적용', () => {
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'debuff', stat: 'defense', flat: -10 });
    expect(mods.compute('defense', 20)).toBe(10);
  });

  it('수동 제거 후 compute가 기본값 반환', () => {
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'buff', stat: 'attack', flat: 50 });
    mods.remove('buff');
    expect(mods.compute('attack', 10)).toBe(10);
  });

  it('duration이 있는 변화는 _tick으로 만료됨', () => {
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'temp', stat: 'speed', flat: 10, remainingDuration: 1000 });

    expect(mods.compute('speed', 5)).toBe(15);

    const expired = mods._tick(1000);
    expect(expired).toHaveLength(1);
    expect(expired[0].sourceId).toBe('temp');
    expect(expired[0].stat).toBe('speed');

    // 만료 후 기본값 반환
    expect(mods.compute('speed', 5)).toBe(5);
  });

  it('duration 없는 변화는 _tick으로 만료되지 않음 (영구)', () => {
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'perm', stat: 'attack', flat: 100 }); // duration 없음

    mods._tick(99999);
    expect(mods.compute('attack', 10)).toBe(110); // 여전히 적용
  });

  it('같은 sourceId 재추가 시 duration 갱신, stacks 증가', () => {
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'poison', stat: 'defense', flat: -5, remainingDuration: 1000, maxStacks: 3 });
    mods.add({ sourceId: 'poison', stat: 'defense', flat: -5, remainingDuration: 2000, maxStacks: 3 }); // 재적용

    const slot = mods.forStat('defense')[0];
    expect(slot.stacks).toBe(2);
    expect(slot.remainingDuration).toBe(2000); // 더 긴 쪽 유지
    expect(mods.compute('defense', 20)).toBe(10); // -5 * 2 stacks = -10
  });
});

// ─── StatsComponent computed getters ─────────────────────────────────────────

describe('StatsComponent — computed getters', () => {
  it('StatModsComponent 없으면 기본값 반환', () => {
    const stats = new StatsComponent({ attack: 20, defense: 10, speed: 5 });
    expect(stats.computedAttack()).toBe(20);
    expect(stats.computedDefense()).toBe(10);
    expect(stats.computedSpeed()).toBe(5);
  });

  it('StatModsComponent 있으면 변화 반영', () => {
    const stats = new StatsComponent({ attack: 20 });
    const mods = new StatModsComponent();
    mods.add({ sourceId: 'buff', stat: 'attack', flat: 30 });

    expect(stats.computedAttack(mods)).toBe(50);
    expect(stats.computedDefense(mods)).toBe(5); // 변화 없음
  });
});

// ─── StatModSystem ────────────────────────────────────────────────────────────

describe('StatModSystem', () => {
  it('addMod — StatModsComponent 없는 entity에 자동 생성 후 추가', () => {
    const world = new World<CoreEvents>();
    const statModSystem = new StatModSystem();
    world.addSystem(statModSystem);

    const entity = world.createEntity();
    entity.add(new StatsComponent({ attack: 10 }));

    expect(entity.has(StatModsComponent)).toBe(false);

    statModSystem.addMod(entity.id, { sourceId: 'rage', stat: 'attack', flat: 30 });
    world.update(16);

    expect(entity.has(StatModsComponent)).toBe(true);
    expect(entity.get(StatsComponent)!.computedAttack(entity.get(StatModsComponent))).toBe(40);
  });

  it('stat_mod:added 이벤트 발행', () => {
    const world = new World<CoreEvents>();
    const statModSystem = new StatModSystem();
    world.addSystem(statModSystem);

    const entity = world.createEntity();
    entity.add(new StatsComponent());

    const addedHandler = vi.fn();
    world.bus.on('stat_mod:added', addedHandler);

    statModSystem.addMod(entity.id, { sourceId: 'buff', stat: 'defense', flat: 10 });
    world.update(16);

    expect(addedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: entity.id, sourceId: 'buff', stat: 'defense', flat: 10 })
    );
  });

  it('duration 만료 시 stat_mod:expired 이벤트 발행 + 효과 제거', () => {
    const world = new World<CoreEvents>();
    const statModSystem = new StatModSystem();
    world.addSystem(statModSystem);

    const entity = world.createEntity();
    entity.add(new StatsComponent({ attack: 10 }));

    const expiredHandler = vi.fn();
    world.bus.on('stat_mod:expired', expiredHandler);

    statModSystem.addMod(entity.id, {
      sourceId: 'temp_buff',
      stat: 'attack',
      flat: 50,
      remainingDuration: 1000,
    });
    world.update(16); // addMod 처리

    // 버프 적용 확인
    const mods = entity.get(StatModsComponent)!;
    expect(entity.get(StatsComponent)!.computedAttack(mods)).toBe(60);

    // 1000ms 경과 후 만료
    world.update(1000);
    expect(expiredHandler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: entity.id, sourceId: 'temp_buff', stat: 'attack' })
    );

    // 효과 제거 확인
    expect(entity.get(StatsComponent)!.computedAttack(entity.get(StatModsComponent))).toBe(10);
  });

  it('removeMod — 수동 제거 + stat_mod:removed 이벤트', () => {
    const world = new World<CoreEvents>();
    const statModSystem = new StatModSystem();
    world.addSystem(statModSystem);

    const entity = world.createEntity();
    entity.add(new StatsComponent({ defense: 20 }));

    statModSystem.addMod(entity.id, { sourceId: 'debuff', stat: 'defense', flat: -10 });
    world.update(16);

    const removedHandler = vi.fn();
    world.bus.on('stat_mod:removed', removedHandler);

    statModSystem.removeMod(entity.id, 'debuff');
    world.update(16);

    expect(removedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: entity.id, sourceId: 'debuff' })
    );
    expect(entity.get(StatsComponent)!.computedDefense(entity.get(StatModsComponent))).toBe(20);
  });
});

// ─── SkillSystem + StatModSystem 통합 ────────────────────────────────────────

describe('SkillSystem + StatModSystem 통합', () => {
  it('stat_mod 스킬 — StatModSystem 주입 시 올바르게 위임', () => {
    const world = new World<CoreEvents>();
    const statModSystem = new StatModSystem();
    const skillSystem = new SkillSystem(undefined, statModSystem);
    world.addSystem(statModSystem);
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster
      .add(new StatsComponent({ attack: 10, mp: 100, maxMp: 100 }))
      .add(new SkillsComponent([rageSkill]));

    skillSystem.useSkill({ casterId: caster.id, skillId: 'rage', targetIds: [] });
    world.update(16);

    const mods = caster.get(StatModsComponent)!;
    expect(caster.get(StatsComponent)!.computedAttack(mods)).toBe(40); // 10 + 30

    // 베이스 스탯은 오염되지 않아야 한다
    expect(caster.get(StatsComponent)!.attack).toBe(10);
  });

  it('stat_mod 만료 후 스탯 원복', () => {
    const world = new World<CoreEvents>();
    const statModSystem = new StatModSystem();
    const skillSystem = new SkillSystem(undefined, statModSystem);
    world.addSystem(statModSystem);
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster
      .add(new StatsComponent({ attack: 10, mp: 100, maxMp: 100 }))
      .add(new SkillsComponent([rageSkill])); // duration: 3000ms

    skillSystem.useSkill({ casterId: caster.id, skillId: 'rage', targetIds: [] });
    world.update(16);

    // 버프 중
    expect(caster.get(StatsComponent)!.computedAttack(caster.get(StatModsComponent))).toBe(40);

    // 3000ms 경과
    world.update(3000);

    // 원복 — 기본 공격력 10
    expect(caster.get(StatsComponent)!.computedAttack(caster.get(StatModsComponent))).toBe(10);
    // 베이스도 오염 안 됨
    expect(caster.get(StatsComponent)!.attack).toBe(10);
  });

  it('약화 스킬 — 적 디버프 (방어 감소 + 공격 배율 감소)', () => {
    const world = new World<CoreEvents>();
    const statModSystem = new StatModSystem();
    const skillSystem = new SkillSystem(undefined, statModSystem);
    world.addSystem(statModSystem);
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster
      .add(new StatsComponent({ mp: 100, maxMp: 100 }))
      .add(new SkillsComponent([weakenSkill]));

    const target = world.createEntity();
    target.add(new StatsComponent({ defense: 20, attack: 100 }));

    skillSystem.useSkill({ casterId: caster.id, skillId: 'weaken', targetIds: [target.id] });
    world.update(16);

    const mods = target.get(StatModsComponent)!;
    const targetStats = target.get(StatsComponent)!;

    // defense: 20 + (-10) = 10
    expect(targetStats.computedDefense(mods)).toBe(10);
    // attack: (100 + 0) * (1 + -0.2) = 80
    expect(targetStats.computedAttack(mods)).toBe(80);
    // 베이스 스탯 오염 없음
    expect(targetStats.defense).toBe(20);
    expect(targetStats.attack).toBe(100);
  });
});
