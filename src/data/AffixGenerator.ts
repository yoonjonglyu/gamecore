/**
 * @module data/AffixGenerator
 * 등급(Rarity)별 접두사(Prefix) / 접미사(Suffix) 롤링 및 난수 능력치 부여 룰 엔진.
 * ARPG(디아블로, 패스오브엑자일 등) 스타일의 절차적 아이템 생성 엔진.
 */

import { SeededRandom } from '../math/SeededRandom';

export type AffixType = 'prefix' | 'suffix';

export interface AffixDef {
  id: string;
  name: string;
  type: AffixType;
  /** 부여할 스탯 명칭 (예: 'attack', 'defense', 'critChance', 'maxHp') */
  stat: string;
  minValue: number;
  maxValue: number;
  /** 가중치 (기본값: 100) */
  weight?: number;
}

export interface RolledAffix {
  def: AffixDef;
  value: number;
}

export interface GeneratedItem {
  baseId: string | number;
  baseName: string;
  fullName: string;
  rarity: string;
  prefixes: RolledAffix[];
  suffixes: RolledAffix[];
  /** 기본 스탯 + 모든 접사 스탯이 합산된 최종 스탯 맵 */
  stats: Record<string, number>;
}

export interface RarityRule {
  rarity: string;
  minPrefixes: number;
  maxPrefixes: number;
  minSuffixes: number;
  maxSuffixes: number;
}

export class AffixGenerator {
  private _affixesByRarity: Map<string, AffixDef[]> = new Map();
  private _rules: Map<string, RarityRule> = new Map();

  constructor() {
    this._initDefaultRules();
  }

  private _initDefaultRules(): void {
    this.setRarityRule({ rarity: 'common', minPrefixes: 0, maxPrefixes: 0, minSuffixes: 0, maxSuffixes: 0 });
    this.setRarityRule({ rarity: 'uncommon', minPrefixes: 0, maxPrefixes: 1, minSuffixes: 0, maxSuffixes: 1 });
    this.setRarityRule({ rarity: 'rare', minPrefixes: 1, maxPrefixes: 2, minSuffixes: 1, maxSuffixes: 2 });
    this.setRarityRule({ rarity: 'epic', minPrefixes: 2, maxPrefixes: 2, minSuffixes: 2, maxSuffixes: 2 });
    this.setRarityRule({ rarity: 'legendary', minPrefixes: 2, maxPrefixes: 3, minSuffixes: 2, maxSuffixes: 3 });
  }

  setRarityRule(rule: RarityRule): this {
    this._rules.set(rule.rarity.toLowerCase(), rule);
    return this;
  }

  registerAffix(rarity: string, affix: AffixDef): this {
    const key = rarity.toLowerCase();
    const list = this._affixesByRarity.get(key) ?? [];
    list.push(affix);
    this._affixesByRarity.set(key, list);
    return this;
  }

  registerAffixes(rarity: string, affixes: AffixDef[]): this {
    for (const affix of affixes) {
      this.registerAffix(rarity, affix);
    }
    return this;
  }

  /**
   * 베이스 아이템 정보와 등급을 바탕으로 접사가 부여된 새 아이템 인스턴스를 생성한다.
   * @param baseItem 베이스 아이템 ID, 이름, 기본 스탯
   * @param rarity 아이템 등급
   * @param random 결정론적 난수 생성기 (선택)
   */
  generate(
    baseItem: { id: string | number; name: string; baseStats?: Record<string, number> },
    rarity: string,
    random?: SeededRandom,
  ): GeneratedItem {
    const rarityKey = rarity.toLowerCase();
    const rule = this._rules.get(rarityKey) ?? {
      rarity,
      minPrefixes: 0,
      maxPrefixes: 1,
      minSuffixes: 0,
      maxSuffixes: 1,
    };

    const availablePool = this._affixesByRarity.get(rarityKey) ?? [];
    const prefixPool = availablePool.filter((a) => a.type === 'prefix');
    const suffixPool = availablePool.filter((a) => a.type === 'suffix');

    // 롤링할 접두사 및 접미사 개수 결정
    const prefixCount = random
      ? random.nextInt(rule.minPrefixes, rule.maxPrefixes)
      : Math.floor(Math.random() * (rule.maxPrefixes - rule.minPrefixes + 1)) + rule.minPrefixes;

    const suffixCount = random
      ? random.nextInt(rule.minSuffixes, rule.maxSuffixes)
      : Math.floor(Math.random() * (rule.maxSuffixes - rule.minSuffixes + 1)) + rule.minSuffixes;

    const rolledPrefixes = this._rollFromPool(prefixPool, prefixCount, random);
    const rolledSuffixes = this._rollFromPool(suffixPool, suffixCount, random);

    // 전체 스탯 합산
    const finalStats: Record<string, number> = { ...(baseItem.baseStats ?? {}) };

    for (const p of rolledPrefixes) {
      finalStats[p.def.stat] = (finalStats[p.def.stat] ?? 0) + p.value;
    }
    for (const s of rolledSuffixes) {
      finalStats[s.def.stat] = (finalStats[s.def.stat] ?? 0) + s.value;
    }

    // 아이템 명칭 조합 (예: "불타는 강철 검 [파괴의]")
    let fullName = baseItem.name;
    if (rolledPrefixes.length > 0) {
      const prefixStr = rolledPrefixes.map((p) => p.def.name).join(' ');
      fullName = `${prefixStr} ${fullName}`;
    }
    if (rolledSuffixes.length > 0) {
      const suffixStr = rolledSuffixes.map((s) => s.def.name).join(' ');
      fullName = `${fullName} (${suffixStr})`;
    }

    return {
      baseId: baseItem.id,
      baseName: baseItem.name,
      fullName: fullName.trim(),
      rarity,
      prefixes: rolledPrefixes,
      suffixes: rolledSuffixes,
      stats: finalStats,
    };
  }

  private _rollFromPool(pool: AffixDef[], count: number, random?: SeededRandom): RolledAffix[] {
    if (pool.length === 0 || count <= 0) return [];

    const selected: RolledAffix[] = [];
    const remainingPool = [...pool];

    for (let i = 0; i < count && remainingPool.length > 0; i++) {
      const totalWeight = remainingPool.reduce((sum, a) => sum + (a.weight ?? 100), 0);
      const target = random ? random.nextFloat(0, totalWeight) : Math.random() * totalWeight;

      let accumulated = 0;
      let chosenIndex = 0;

      for (let j = 0; j < remainingPool.length; j++) {
        accumulated += remainingPool[j].weight ?? 100;
        if (target <= accumulated) {
          chosenIndex = j;
          break;
        }
      }

      const chosenDef = remainingPool.splice(chosenIndex, 1)[0];
      const value = random
        ? random.nextInt(chosenDef.minValue, chosenDef.maxValue)
        : Math.floor(Math.random() * (chosenDef.maxValue - chosenDef.minValue + 1)) + chosenDef.minValue;

      selected.push({ def: chosenDef, value });
    }

    return selected;
  }
}
