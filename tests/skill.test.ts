import { describe, it, expect, vi } from 'vitest';
import {
  World,
  StatsComponent,
  StatModsComponent,
  SkillsComponent,
  StatusEffectsComponent,
  SkillSystem,
  CoreEvents,
  SkillDef,
} from '../src/index';

// ─── 샘플 스킬 정의 ───────────────────────────────────────────────────────────

const fireball: SkillDef = {
  id: 'fireball',
  name: '파이어볼',
  mpCost: 20,
  cooldown: 3000,
  targetType: 'single_enemy',
  effects: [
    { type: 'damage', basePower: 50, scaling: { attack: 0.5 }, critChance: 0 },
    { type: 'status', statusId: 'burn', chance: 1.0, duration: 2000 },
  ],
};

const heal: SkillDef = {
  id: 'heal',
  name: '힐',
  mpCost: 15,
  cooldown: 2000,
  targetType: 'single_ally',
  effects: [
    { type: 'heal', basePower: 40 },
  ],
};

const selfBuff: SkillDef = {
  id: 'rage',
  name: '분노',
  mpCost: 10,
  cooldown: 5000,
  targetType: 'self',
  effects: [
    { type: 'stat_mod', stat: 'attack', flat: 20, duration: 3000 },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SkillSystem — 기본 스킬 사용', () => {
  it('데미지 스킬 — HP 감소 + skill:used 이벤트', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster.add(new StatsComponent({ attack: 30, mp: 100, maxMp: 100, defense: 0 }))
          .add(new SkillsComponent([fireball]));

    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 200, defense: 0 }));

    const usedHandler = vi.fn();
    world.bus.on('skill:used', usedHandler);

    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [target.id] });
    world.update(16);

    // basePower(50) + attack(30) * 0.5(scaling) = 65 effective
    expect(target.get(StatsComponent)!.hp).toBe(135);
    expect(usedHandler).toHaveBeenCalledOnce();
    expect(usedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ casterId: caster.id, skillId: 'fireball' })
    );
  });

  it('데미지 스킬 — MP 소비 확인', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster.add(new StatsComponent({ mp: 50, maxMp: 50, attack: 0 }))
          .add(new SkillsComponent([fireball]));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 200, defense: 0 }));

    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [target.id] });
    world.update(16);

    expect(caster.get(StatsComponent)!.mp).toBe(30); // 50 - 20
  });

  it('힐 스킬 — HP 회복', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const healer = world.createEntity();
    healer.add(new StatsComponent({ mp: 100, maxMp: 100 }))
           .add(new SkillsComponent([heal]));

    const target = world.createEntity();
    const targetStats = new StatsComponent({ maxHp: 100, hp: 30, defense: 0 });
    target.add(targetStats);

    skillSystem.useSkill({ casterId: healer.id, skillId: 'heal', targetIds: [target.id] });
    world.update(16);

    // 30 + 40 = 70
    expect(target.get(StatsComponent)!.hp).toBe(70);
  });

  it('self 타겟 스킬 — targetIds 없어도 자신에게 적용', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    const stats = new StatsComponent({ attack: 10, mp: 50, maxMp: 50 });
    caster.add(stats).add(new SkillsComponent([selfBuff]));

    skillSystem.useSkill({ casterId: caster.id, skillId: 'rage', targetIds: [] });
    world.update(16);

    // computed: attack(10) + stat_mod flat(20) = 30
    const mods = caster.get(StatModsComponent);
    expect(caster.get(StatsComponent)!.computedAttack(mods)).toBe(30);
    // 베이스는 오염 없음
    expect(caster.get(StatsComponent)!.attack).toBe(10);
  });
});

describe('SkillSystem — 검증 실패', () => {
  it('스킬 미보유 → skill:failed (no_skill)', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster.add(new StatsComponent({ mp: 100, maxMp: 100 }))
          .add(new SkillsComponent([])); // 스킬 없음

    const failedHandler = vi.fn();
    world.bus.on('skill:failed', failedHandler);

    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [] });
    world.update(16);

    expect(failedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'no_skill' })
    );
  });

  it('MP 부족 → skill:failed (no_mp)', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster.add(new StatsComponent({ mp: 5, maxMp: 100 })) // MP 5, 스킬은 20 필요
          .add(new SkillsComponent([fireball]));

    const failedHandler = vi.fn();
    world.bus.on('skill:failed', failedHandler);

    const target = world.createEntity();
    target.add(new StatsComponent());

    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [target.id] });
    world.update(16);

    expect(failedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'no_mp' })
    );
  });

  it('쿨다운 중 → skill:failed (cooldown)', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster.add(new StatsComponent({ mp: 100, maxMp: 100, attack: 0 }))
          .add(new SkillsComponent([fireball]));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 500, defense: 0 }));

    // 첫 사용 — 성공
    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [target.id] });
    world.update(16);

    const failedHandler = vi.fn();
    world.bus.on('skill:failed', failedHandler);

    // 두 번째 사용 — 쿨다운 중
    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [target.id] });
    world.update(16);

    expect(failedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'cooldown' })
    );
  });
});

describe('SkillSystem — 쿨다운 & 상태이상', () => {
  it('쿨다운이 지나면 스킬이 다시 사용 가능해진다', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster.add(new StatsComponent({ mp: 200, maxMp: 200, attack: 0 }))
          .add(new SkillsComponent([fireball])); // cooldown: 3000ms

    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 1000, defense: 0 }));

    // 1회 사용
    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [target.id] });
    world.update(16);

    const skills = caster.get(SkillsComponent)!;
    expect(skills.isReady('fireball')).toBe(false);

    // 3000ms 경과
    world.update(3000);
    expect(skills.isReady('fireball')).toBe(true);
  });

  it('쿨다운 완료 시 skill:cooldown:ready 이벤트 발행', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster.add(new StatsComponent({ mp: 200, maxMp: 200, attack: 0 }))
          .add(new SkillsComponent([fireball]));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 1000, defense: 0 }));

    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [target.id] });
    world.update(16);

    const readyHandler = vi.fn();
    world.bus.on('skill:cooldown:ready', readyHandler);

    world.update(3000);
    expect(readyHandler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: caster.id, skillId: 'fireball' })
    );
  });

  it('상태이상(burn) 부여 및 만료 이벤트', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    const caster = world.createEntity();
    caster.add(new StatsComponent({ mp: 100, maxMp: 100, attack: 0 }))
          .add(new SkillsComponent([fireball]));
    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 200, defense: 0 }));

    const appliedHandler = vi.fn();
    const expiredHandler = vi.fn();
    world.bus.on('status:applied', appliedHandler);
    world.bus.on('status:expired', expiredHandler);

    skillSystem.useSkill({ casterId: caster.id, skillId: 'fireball', targetIds: [target.id] });
    world.update(16);

    expect(appliedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: target.id, statusId: 'burn' })
    );

    // 상태이상이 부여되면 StatusEffectsComponent가 자동 추가되어야 한다
    expect(target.get(StatusEffectsComponent)?.has('burn')).toBe(true);

    // 2000ms 후 만료
    world.update(2000);
    expect(expiredHandler).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: target.id, statusId: 'burn' })
    );
  });
});
