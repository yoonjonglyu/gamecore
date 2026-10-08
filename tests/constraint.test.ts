import { describe, it, expect, vi } from 'vitest';
import {
  World,
  StatsComponent,
  SkillsComponent,
  ClassComponent,
  EquipmentComponent,
  StatusEffectsComponent,
  SkillSystem,
  ConstraintChecker,
  CoreEvents,
  SkillDef,
  Constraint,
} from '../src/index';

// ─── 제약조건이 있는 샘플 스킬 ──────────────────────────────────────────────────

const mageFireball: SkillDef = {
  id: 'mage_fireball',
  name: '마법사 파이어볼',
  mpCost: 20,
  cooldown: 0,
  targetType: 'single_enemy',
  constraints: [
    { type: 'level', min: 10 },
    { type: 'class', allowed: ['mage', 'wizard'] },
    { type: 'weapon', allowed: ['staff', 'wand'] },
  ],
  effects: [
    { type: 'damage', basePower: 50, critChance: 0 },
  ],
};

const berserkerRage: SkillDef = {
  id: 'berserk',
  name: '광전사의 분노',
  mpCost: 10,
  cooldown: 0,
  targetType: 'self',
  constraints: [
    { type: 'stat_min', stat: 'attack', value: 30 },
    { type: 'not_status', statusId: 'sleep' },
  ],
  effects: [
    { type: 'stat_mod', stat: 'attack', flat: 30, duration: 3000 },
  ],
};

const fireElementSkill: SkillDef = {
  id: 'fire_mastery',
  name: '불꽃 마스터리',
  mpCost: 5,
  cooldown: 0,
  targetType: 'self',
  constraints: [
    { type: 'element', allowed: ['fire'] },
  ],
  effects: [{ type: 'heal', basePower: 20 }],
};

const questSkill: SkillDef = {
  id: 'hero_strike',
  name: '영웅의 일격',
  mpCost: 15,
  cooldown: 0,
  targetType: 'single_enemy',
  constraints: [
    { type: 'custom', id: 'quest_complete', data: 'main_quest_1' },
  ],
  effects: [{ type: 'damage', basePower: 100, critChance: 0 }],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConstraintChecker — 직접 평가', () => {
  it('레벨 제약조건 통과/실패', () => {
    const checker = new ConstraintChecker();

    const entity = { get: (C: any) => C === ClassComponent ? new ClassComponent({ classId: 'mage', level: 15 }) : undefined } as any;
    const lowLevel = { get: (C: any) => C === ClassComponent ? new ClassComponent({ classId: 'mage', level: 5 }) : undefined } as any;

    expect(checker.check(entity, [{ type: 'level', min: 10 }]).ok).toBe(true);
    expect(checker.check(lowLevel, [{ type: 'level', min: 10 }]).ok).toBe(false);
  });

  it('직업 제약조건 — 허용된 직업은 통과, 아니면 실패', () => {
    const checker = new ConstraintChecker();
    const mage = { get: (C: any) => C === ClassComponent ? new ClassComponent({ classId: 'mage', level: 1 }) : undefined } as any;
    const warrior = { get: (C: any) => C === ClassComponent ? new ClassComponent({ classId: 'warrior', level: 1 }) : undefined } as any;

    const c: Constraint = { type: 'class', allowed: ['mage', 'wizard'] };
    expect(checker.check(mage, [c]).ok).toBe(true);
    const result = checker.check(warrior, [c]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('warrior');
  });

  it('무기 제약조건 — 장착 무기 타입 확인', () => {
    const checker = new ConstraintChecker();

    const equip = new EquipmentComponent();
    equip.equip('weapon', { defId: 1, weaponType: 'staff' });

    const withStaff = { get: (C: any) => C === EquipmentComponent ? equip : undefined } as any;
    const noEquip = { get: () => undefined } as any;

    expect(checker.check(withStaff, [{ type: 'weapon', allowed: ['staff', 'wand'] }]).ok).toBe(true);
    expect(checker.check(noEquip, [{ type: 'weapon', allowed: ['staff'] }]).ok).toBe(false);
  });

  it('속성 제약조건 — 캐릭터 + 장착 아이템 속성 합산', () => {
    const checker = new ConstraintChecker();

    // 클래스에 fire 속성
    const fireChar = new ClassComponent({ classId: 'mage', level: 1, elements: ['fire'] });
    const entity = { get: (C: any) => C === ClassComponent ? fireChar : undefined } as any;

    expect(checker.check(entity, [{ type: 'element', allowed: ['fire'] }]).ok).toBe(true);
    expect(checker.check(entity, [{ type: 'element', allowed: ['water'] }]).ok).toBe(false);
  });

  it('stat_min 제약조건', () => {
    const checker = new ConstraintChecker();
    const stats = new StatsComponent({ attack: 25 });
    const entity = { get: (C: any) => C === StatsComponent ? stats : undefined } as any;

    expect(checker.check(entity, [{ type: 'stat_min', stat: 'attack', value: 20 }]).ok).toBe(true);
    expect(checker.check(entity, [{ type: 'stat_min', stat: 'attack', value: 30 }]).ok).toBe(false);
  });

  it('has_status / not_status 제약조건', () => {
    const checker = new ConstraintChecker();

    const withBurn = new StatusEffectsComponent();
    withBurn.apply('burn', 2000, -1);
    const entity = { get: (C: any) => C === StatusEffectsComponent ? withBurn : undefined } as any;
    const clean = { get: () => undefined } as any;

    expect(checker.check(entity, [{ type: 'has_status', statusId: 'burn' }]).ok).toBe(true);
    expect(checker.check(clean, [{ type: 'has_status', statusId: 'burn' }]).ok).toBe(false);
    expect(checker.check(entity, [{ type: 'not_status', statusId: 'burn' }]).ok).toBe(false);
    expect(checker.check(clean, [{ type: 'not_status', statusId: 'burn' }]).ok).toBe(true);
  });

  it('커스텀 제약조건 핸들러 등록 및 평가', () => {
    const checker = new ConstraintChecker();

    // 커스텀 핸들러: questId가 'main_quest_1'이면 통과
    checker.registerCustomHandler('quest_complete', (entity, data) => {
      const completed = (entity as any)._completedQuests as string[];
      if (completed?.includes(data as string)) return { ok: true };
      return { ok: false, failed: { type: 'custom', id: 'quest_complete', data }, reason: `퀘스트 미완료: ${data}` };
    });

    const heroEntity = { _completedQuests: ['main_quest_1'], get: () => undefined } as any;
    const normalEntity = { _completedQuests: [], get: () => undefined } as any;

    expect(checker.check(heroEntity, [{ type: 'custom', id: 'quest_complete', data: 'main_quest_1' }]).ok).toBe(true);
    expect(checker.check(normalEntity, [{ type: 'custom', id: 'quest_complete', data: 'main_quest_1' }]).ok).toBe(false);
  });
});

describe('SkillSystem — 제약조건 통합', () => {
  function makeWorld() {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);
    return { world, skillSystem };
  }

  it('제약조건 통과 — 스킬 정상 사용', () => {
    const { world, skillSystem } = makeWorld();

    const caster = world.createEntity();
    caster
      .add(new StatsComponent({ mp: 100, maxMp: 100, attack: 0, defense: 0 }))
      .add(new SkillsComponent([mageFireball]))
      .add(new ClassComponent({ classId: 'mage', level: 15 }));

    const equip = new EquipmentComponent();
    equip.equip('weapon', { defId: 10, weaponType: 'staff' });
    caster.add(equip);

    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 200, defense: 0 }));

    const usedHandler = vi.fn();
    world.bus.on('skill:used', usedHandler);

    skillSystem.useSkill({ casterId: caster.id, skillId: 'mage_fireball', targetIds: [target.id] });
    world.update(16);

    expect(usedHandler).toHaveBeenCalledOnce();
    expect(target.get(StatsComponent)!.hp).toBe(150); // 200 - 50
  });

  it('레벨 부족 → skill:failed (constraint)', () => {
    const { world, skillSystem } = makeWorld();

    const caster = world.createEntity();
    caster
      .add(new StatsComponent({ mp: 100, maxMp: 100 }))
      .add(new SkillsComponent([mageFireball]))
      .add(new ClassComponent({ classId: 'mage', level: 5 })); // 레벨 5 < min 10

    const equip = new EquipmentComponent();
    equip.equip('weapon', { defId: 10, weaponType: 'staff' });
    caster.add(equip);

    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 200 }));

    const failedHandler = vi.fn();
    world.bus.on('skill:failed', failedHandler);

    skillSystem.useSkill({ casterId: caster.id, skillId: 'mage_fireball', targetIds: [target.id] });
    world.update(16);

    expect(failedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'constraint' })
    );
    // HP는 그대로
    expect(target.get(StatsComponent)!.hp).toBe(200);
  });

  it('직업 불일치 → skill:failed (constraint) + constraintReason 포함', () => {
    const { world, skillSystem } = makeWorld();

    const caster = world.createEntity();
    caster
      .add(new StatsComponent({ mp: 100, maxMp: 100 }))
      .add(new SkillsComponent([mageFireball]))
      .add(new ClassComponent({ classId: 'warrior', level: 20 })); // warrior는 허용 안 됨

    const equip = new EquipmentComponent();
    equip.equip('weapon', { defId: 10, weaponType: 'staff' });
    caster.add(equip);

    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 200 }));

    const failedHandler = vi.fn();
    world.bus.on('skill:failed', failedHandler);

    skillSystem.useSkill({ casterId: caster.id, skillId: 'mage_fireball', targetIds: [target.id] });
    world.update(16);

    expect(failedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'constraint', constraintReason: expect.stringContaining('warrior') })
    );
  });

  it('not_status — sleep 상태에서 스킬 사용 불가', () => {
    const { world, skillSystem } = makeWorld();

    const caster = world.createEntity();
    const statuses = new StatusEffectsComponent();
    statuses.apply('sleep', 5000, -1);
    caster
      .add(new StatsComponent({ mp: 100, maxMp: 100, attack: 50 }))
      .add(new SkillsComponent([berserkerRage]))
      .add(statuses);

    const failedHandler = vi.fn();
    world.bus.on('skill:failed', failedHandler);

    skillSystem.useSkill({ casterId: caster.id, skillId: 'berserk', targetIds: [] });
    world.update(16);

    expect(failedHandler).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'constraint' })
    );
  });

  it('커스텀 핸들러 주입 — ConstraintChecker DI', () => {
    const checker = new ConstraintChecker();
    checker.registerCustomHandler('quest_complete', (entity, data) => {
      const e = entity as any;
      return e._completedQuests?.includes(data)
        ? { ok: true }
        : { ok: false, failed: { type: 'custom', id: 'quest_complete' }, reason: '퀘스트 미완료' };
    });

    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem(checker);
    world.addSystem(skillSystem);

    const hero = world.createEntity();
    (hero as any)._completedQuests = ['main_quest_1'];
    hero.add(new StatsComponent({ mp: 100, maxMp: 100, attack: 0, defense: 0 }))
        .add(new SkillsComponent([questSkill]));

    const target = world.createEntity();
    target.add(new StatsComponent({ maxHp: 300, defense: 0 }));

    const usedHandler = vi.fn();
    world.bus.on('skill:used', usedHandler);

    skillSystem.useSkill({ casterId: hero.id, skillId: 'hero_strike', targetIds: [target.id] });
    world.update(16);

    expect(usedHandler).toHaveBeenCalledOnce();
  });
});
