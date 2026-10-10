import { describe, it, expect, vi } from 'vitest';
import {
  World,
  StatsComponent,
  StatModsComponent,
  SkillsComponent,
  SkillSystem,
  StatusEffectSystem,
  CoreEvents,
} from '../src/index';

describe('Time Abstraction & Skill/Status Pipeline', () => {
  it('시간 추상화: 턴제 모드(mode: turn)와 실시간 모드(mode: realtime)를 모두 수용해야 한다', () => {
    const world = new World<CoreEvents>();
    const statusSystem = new StatusEffectSystem();
    world.addSystem(statusSystem);

    const entity = world.createEntity();
    entity.add(new StatsComponent({ maxHp: 100 }));

    // 턴제 지속시간 3턴인 스턴 상태이상 부여
    statusSystem.applyStatus(entity, 'stun', 3, 999);

    // 1턴 경과
    world.update(1, 'turn');
    expect(entity.get(statusSystem.query[0] as any)!.get('stun')!.remainingDuration).toBe(2);

    // 2턴 경과
    world.update(2, 'turn');
    // 총 3턴 경과 -> 만료되어 제거됨
    expect(entity.get(statusSystem.query[0] as any)!.has('stun')).toBe(false);
  });

  it('SkillEffectExecutor: 커스텀 효과를 등록하고 선언적으로 디스패치할 수 있어야 한다', () => {
    const world = new World<CoreEvents>();
    const skillSystem = new SkillSystem();
    world.addSystem(skillSystem);

    // 커스텀 효과 'mana_burn' 등록
    const manaBurnSpy = vi.fn();
    skillSystem.registerEffect('mana_burn', (effect: any, ctx) => {
      manaBurnSpy(effect.burnAmount, ctx.target.id);
      const targetStats = ctx.target.get(StatsComponent);
      if (targetStats) {
        targetStats.mp = Math.max(0, targetStats.mp - effect.burnAmount);
      }
    });

    const caster = world.createEntity();
    const skills = new SkillsComponent();
    skills.learn({
      id: 'spell_drain',
      name: '마나 번',
      mpCost: 10,
      cooldown: 0,
      targetType: 'single_enemy',
      effects: [
        { type: 'mana_burn' as any, burnAmount: 30 },
      ],
    });
    caster.add(skills).add(new StatsComponent({ mp: 50, maxMp: 50 }));

    const target = world.createEntity();
    target.add(new StatsComponent({ mp: 50, maxMp: 50 }));

    skillSystem.useSkill({
      casterId: caster.id,
      skillId: 'spell_drain',
      targetIds: [target.id],
    });
    world.update(0);

    expect(manaBurnSpy).toHaveBeenCalledWith(30, target.id);
    expect(target.get(StatsComponent)!.mp).toBe(20);
    expect(caster.get(StatsComponent)!.mp).toBe(40); // 10 mp cost
  });

  it('StatusEffectSystem: 도트 틱(화상/중독) 피해를 주기적으로 발생시켜야 한다', () => {
    const world = new World<CoreEvents>();
    const statusSystem = new StatusEffectSystem();
    world.addSystem(statusSystem);

    const dotHandler = vi.fn();
    world.bus.on('status:tick:damage', dotHandler);

    const monster = world.createEntity();
    monster.add(new StatsComponent({ maxHp: 100, hp: 100 }));

    // 화상: 3000ms 지속, 1000ms마다 15 데미지
    statusSystem.applyStatus(monster, 'burn', 3000, 1, 1, 1, {
      tickInterval: 1000,
      tickDamage: 15,
    });

    // 1000ms 경과: 1번째 틱 발생 (100 -> 85)
    world.update(1000, 'realtime');
    expect(monster.get(StatsComponent)!.hp).toBe(85);
    expect(dotHandler).toHaveBeenCalledTimes(1);

    // 1000ms 추가 경과: 2번째 틱 발생 (85 -> 70)
    world.update(1000, 'realtime');
    expect(monster.get(StatsComponent)!.hp).toBe(70);
    expect(dotHandler).toHaveBeenCalledTimes(2);
  });

  it('StatusEffectSystem: 상태이상 만료 시 연계된 StatModsComponent 버프를 자동으로 롤백 및 클린업해야 한다', () => {
    const world = new World<CoreEvents>();
    const statusSystem = new StatusEffectSystem();
    world.addSystem(statusSystem);

    const hero = world.createEntity();
    hero.add(new StatsComponent({ attack: 50 }));

    // 'berserk' 상태이상 (duration: 2000ms)과 함께 공격력 +30 버프 부여
    statusSystem.applyStatus(hero, 'berserk', 2000, 1, 1, 1, {
      linkedModifiers: [
        { sourceId: 'berserk_atk', stat: 'attack', flat: 30 },
      ],
    });

    const modsComp = hero.get(StatModsComponent)!;
    expect(modsComp).toBeDefined();
    // 버프 적용 중 최종 공격력: 50 + 30 = 80
    expect(hero.get(StatsComponent)!.computedAttack(modsComp)).toBe(80);

    // 1000ms 경과: 아직 버프 유지
    world.update(1000, 'realtime');
    expect(hero.get(StatsComponent)!.computedAttack(modsComp)).toBe(80);

    // 추가 1000ms 경과: berserk 만료 -> 연계 모디파이어 자동 제거 및 롤백!
    world.update(1000, 'realtime');
    expect(modsComp.has('status:berserk:berserk_atk')).toBe(false);
    expect(hero.get(StatsComponent)!.computedAttack(modsComp)).toBe(50);
  });
});
