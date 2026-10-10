import { describe, it, expect } from 'vitest';
import {
  StatPipeline,
  ExtendedStatsComponent,
} from '../src/index';

describe('Custom Stat Pipeline Engine', () => {
  it('4단계 연산 순서 (Base -> Flat -> Percent -> Final Amplification)를 정확히 보장해야 한다', () => {
    const pipeline = new StatPipeline();

    // 1) Base: 100
    pipeline.defineStat({ name: 'attack', base: 100 });

    // 2) Flat Modifiers: +20, +30 -> afterFlat = 150
    pipeline.addModifier({ sourceId: 'buff_flat1', stat: 'attack', flat: 20 });
    pipeline.addModifier({ sourceId: 'buff_flat2', stat: 'attack', flat: 30 });

    // 3) Percent Modifiers: +20%, +10% -> total percent = +30% -> afterPercent = 150 * 1.3 = 195
    pipeline.addModifier({ sourceId: 'buff_pct1', stat: 'attack', percent: 0.2 });
    pipeline.addModifier({ sourceId: 'buff_pct2', stat: 'attack', percent: 0.1 });

    // 4) Final Amplification: +10% (0.1) -> final = 195 * 1.1 = 214.5
    pipeline.addModifier({ sourceId: 'buff_amp1', stat: 'attack', amplification: 0.1 });

    const breakdown = pipeline.calculateBreakdown('attack');
    expect(breakdown.base).toBe(100);
    expect(breakdown.flatSum).toBe(50);
    expect(breakdown.afterFlat).toBe(150);
    expect(breakdown.percentSum).toBeCloseTo(0.3);
    expect(breakdown.afterPercent).toBeCloseTo(195);
    expect(breakdown.amplificationSum).toBeCloseTo(0.1);
    expect(breakdown.finalValue).toBeCloseTo(214.5);

    expect(pipeline.get('attack')).toBeCloseTo(214.5);
  });

  it('스탯 의존성 정의 (matk = int * 2.0 + wis * 0.8)를 정확히 계산해야 한다', () => {
    const pipeline = new StatPipeline();

    pipeline.defineStat({ name: 'int', base: 20 });
    pipeline.defineStat({ name: 'wis', base: 15 });

    pipeline.defineStat({
      name: 'matk',
      dependencies: ['int', 'wis'],
      formula: (reader) => reader.get('int') * 2.0 + reader.get('wis') * 0.8,
    });

    // 20 * 2.0 + 15 * 0.8 = 40 + 12 = 52
    expect(pipeline.get('matk')).toBe(52);

    // matk 자체에도 flat / percent 모디파이어 적용 가능
    pipeline.addModifier({ sourceId: 'ring_matk', stat: 'matk', flat: 8 }); // 52 + 8 = 60
    pipeline.addModifier({ sourceId: 'staff_matk_pct', stat: 'matk', percent: 0.5 }); // 60 * 1.5 = 90
    expect(pipeline.get('matk')).toBe(90);
  });

  it('Dirty Flag & Caching: 스탯 변경 시에만 재계산하고 캐시를 재활용해야 한다', () => {
    let formulaRunCount = 0;
    const pipeline = new StatPipeline();

    pipeline.defineStat({ name: 'str', base: 10 });
    pipeline.defineStat({
      name: 'patk',
      dependencies: ['str'],
      formula: (r) => {
        formulaRunCount++;
        return r.get('str') * 3;
      },
    });

    // 최초 조회: 계산 실행 (formulaRunCount = 1)
    expect(pipeline.get('patk')).toBe(30);
    expect(formulaRunCount).toBe(1);
    expect(pipeline.isDirty('patk')).toBe(false);

    // 변경 없음: 캐시 사용 (formulaRunCount 여전히 1)
    expect(pipeline.get('patk')).toBe(30);
    expect(formulaRunCount).toBe(1);

    // 부모 스탯(str)의 베이스 변경 -> 자식(patk)도 자동으로 dirty 전파!
    pipeline.setBase('str', 20);
    expect(pipeline.isDirty('str')).toBe(true);
    expect(pipeline.isDirty('patk')).toBe(true);

    // 재조회 시 재계산 (formulaRunCount = 2)
    expect(pipeline.get('patk')).toBe(60);
    expect(formulaRunCount).toBe(2);
    expect(pipeline.isDirty('patk')).toBe(false);
  });

  it('순환 참조(Cycle) 발생 시 명확한 에러를 발생시켜야 한다', () => {
    const pipeline = new StatPipeline();

    pipeline.defineStat({
      name: 'statA',
      dependencies: ['statB'],
      formula: (r) => r.get('statB') + 10,
    });
    pipeline.defineStat({
      name: 'statB',
      dependencies: ['statA'],
      formula: (r) => r.get('statA') + 10,
    });

    expect(() => {
      pipeline.get('statA');
    }).toThrow(/Circular dependency detected/);
  });

  it('ExtendedStatsComponent: 컴포넌트 레벨에서 스탯 파이프라인 및 자원 관리가 유기적으로 동작해야 한다', () => {
    const comp = new ExtendedStatsComponent({
      baseStats: {
        int: 30,
        wis: 25,
        maxHp: 200,
        defense: 10,
      },
      currentResources: {
        hp: 180,
      },
    });

    comp.defineStat({
      name: 'matk',
      dependencies: ['int', 'wis'],
      formula: (r) => r.get('int') * 2.0 + r.get('wis') * 1.0,
    });

    expect(comp.get('matk')).toBe(85);
    expect(comp.hp).toBe(180);
    expect(comp.maxHp).toBe(200);
    expect(comp.hpRatio).toBe(0.9);
    expect(comp.isDead).toBe(false);

    // 데미지 차감
    comp.modifyResource('hp', -200, 'maxHp');
    expect(comp.hp).toBe(0);
    expect(comp.isDead).toBe(true);
  });

  it('다양한 스탯(1차: STR/DEX/INT/LUK, 2차 파생: CRIT/EVASION/PEN, 속성/유틸: FireDmg/Stamina)의 동적 확장 및 장비 착용 연동', () => {
    // 1. 임의의 다원적 스탯을 가진 캐릭터 생성
    const heroStats = new ExtendedStatsComponent({
      baseStats: {
        str: 15,
        dex: 20,
        int: 10,
        luk: 12,
        fireResist: 0.1, // 10% 화염 저항
      },
      currentResources: {
        stamina: 100, // MP 대신 스테미나 게임
      },
    });

    // 2. 2차 파생 스탯 공식 정의
    // critRate = dex * 0.005 + luk * 0.008 (치명타율)
    heroStats.defineStat({
      name: 'critRate',
      dependencies: ['dex', 'luk'],
      formula: (r) => r.get('dex') * 0.005 + r.get('luk') * 0.008,
      max: 1.0, // 최대 100%
    });

    // patk = str * 2.5 + dex * 1.0 (물리 공격력)
    heroStats.defineStat({
      name: 'patk',
      dependencies: ['str', 'dex'],
      formula: (r) => r.get('str') * 2.5 + r.get('dex') * 1.0,
    });

    // 초기값 검증
    // critRate = 20 * 0.005 + 12 * 0.008 = 0.1 + 0.096 = 0.196 (19.6%)
    expect(heroStats.get('critRate')).toBeCloseTo(0.196);
    // patk = 15 * 2.5 + 20 * 1.0 = 37.5 + 20 = 57.5
    expect(heroStats.get('patk')).toBeCloseTo(57.5);

    // 3. 커스텀 장비(단검: dex +10, critRate +0.05, fireDamage +15) 장착 모디파이어 추가
    heroStats.addModifier({ sourceId: 'equip:weapon:dex', stat: 'dex', flat: 10 });
    heroStats.addModifier({ sourceId: 'equip:weapon:critRate', stat: 'critRate', flat: 0.05 });
    heroStats.addModifier({ sourceId: 'equip:weapon:fireDamage', stat: 'fireDamage', flat: 15 });

    // dex가 20 -> 30으로 증가함에 따라:
    // patk = 15 * 2.5 + 30 * 1.0 = 37.5 + 30 = 67.5 (자동 연쇄 재계산!)
    expect(heroStats.get('patk')).toBeCloseTo(67.5);
    // critRate = (30 * 0.005 + 12 * 0.008) + 0.05 = 0.15 + 0.096 + 0.05 = 0.296 (29.6%)
    expect(heroStats.get('critRate')).toBeCloseTo(0.296);
    // 화염 데미지 신규 스탯 즉시 조회
    expect(heroStats.get('fireDamage')).toBe(15);

    // 4. 장비 해제 시 접두사(equip:weapon:)로 한 번에 클린업
    heroStats.removeModifiersBySource('equip:weapon:');
    expect(heroStats.get('patk')).toBeCloseTo(57.5);
    expect(heroStats.get('critRate')).toBeCloseTo(0.196);
    expect(heroStats.get('fireDamage')).toBe(0);
  });
});

