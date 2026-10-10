/**
 * @module stats/StatPipeline
 * 선언적 커스텀 스탯 파이프라인 엔진.
 *
 * 4단계 연산 순서 보장:
 *   1) Base Stat (기본값 또는 의존성 수식 기반 계산)
 *   2) Flat Modifiers (합연산 +)
 *   3) Percent Modifiers (곱연산 %)
 *   4) Final Amplification (최종 증폭 %)
 *
 * DAG 기반 스탯 의존성 정의 및 순환 참조(Cycle) 감지.
 * Dirty Flag & Caching을 통한 초고속 O(1) 조회 성능 최적화.
 */

export interface StatReader {
  get(statName: string): number;
}

export type StatFormula = (reader: StatReader) => number;

export interface StatDefinition {
  name: string;
  base?: number;
  formula?: StatFormula;
  dependencies?: string[];
  min?: number;
  max?: number;
}

export interface PipelineStatModifier {
  sourceId: string;
  stat: string;
  flat?: number;
  percent?: number;
  amplification?: number;
  remainingDuration?: number;
  stacks?: number;
  maxStacks?: number;
  sourceEntityId?: number;
}

export interface StatCalculationBreakdown {
  stat: string;
  base: number;
  flatSum: number;
  afterFlat: number;
  percentSum: number;
  afterPercent: number;
  amplificationSum: number;
  finalValue: number;
}

export class StatPipeline implements StatReader {
  /** 스탯 메타 정의 */
  private _definitions: Map<string, StatDefinition> = new Map();
  /** 기본값 맵 (수식 외 직접 설정된 베이스값) */
  private _baseValues: Map<string, number> = new Map();
  /** 스탯별 적용된 모디파이어 맵: stat -> Map<sourceId, PipelineStatModifier> */
  private _modifiers: Map<string, Map<string, PipelineStatModifier>> = new Map();

  /** 캐시된 계산 결과 */
  private _cache: Map<string, number> = new Map();
  /** dirty 플래그 */
  private _dirty: Map<string, boolean> = new Map();

  /** 의존성 그래프: parentStat -> Set<dependentChildStat> (parent가 바뀌면 child도 dirty) */
  private _dependents: Map<string, Set<string>> = new Map();

  // ──────────────────────────────────────────────
  // 스탯 선언 및 기본값
  // ──────────────────────────────────────────────

  /**
   * 스탯을 선언적으로 정의한다.
   * @example
   * pipeline.defineStat({ name: 'int', base: 20 });
   * pipeline.defineStat({ name: 'wis', base: 15 });
   * pipeline.defineStat({
   *   name: 'matk',
   *   dependencies: ['int', 'wis'],
   *   formula: (r) => r.get('int') * 2.0 + r.get('wis') * 0.8
   * });
   */
  defineStat(def: StatDefinition): this {
    this._definitions.set(def.name, { ...def });
    if (def.base !== undefined) {
      this._baseValues.set(def.name, def.base);
    }

    // 의존성 등록
    if (def.dependencies) {
      for (const dep of def.dependencies) {
        if (!this._dependents.has(dep)) {
          this._dependents.set(dep, new Set());
        }
        this._dependents.get(dep)!.add(def.name);
      }
    }

    this._markDirty(def.name);
    return this;
  }

  setBase(statName: string, value: number): this {
    this._baseValues.set(statName, value);
    if (!this._definitions.has(statName)) {
      this._definitions.set(statName, { name: statName, base: value });
    }
    this._markDirty(statName);
    return this;
  }

  getBase(statName: string): number {
    return this._baseValues.get(statName) ?? this._definitions.get(statName)?.base ?? 0;
  }

  hasStat(statName: string): boolean {
    return this._definitions.has(statName) || this._baseValues.has(statName);
  }

  // ──────────────────────────────────────────────
  // 모디파이어 관리
  // ──────────────────────────────────────────────

  addModifier(mod: PipelineStatModifier): this {
    if (!this._modifiers.has(mod.stat)) {
      this._modifiers.set(mod.stat, new Map());
    }
    const statMods = this._modifiers.get(mod.stat)!;
    const existing = statMods.get(mod.sourceId);

    if (existing) {
      // 지속시간 갱신
      if (mod.remainingDuration !== undefined && existing.remainingDuration !== undefined) {
        existing.remainingDuration = Math.max(existing.remainingDuration, mod.remainingDuration);
      } else if (mod.remainingDuration !== undefined) {
        existing.remainingDuration = mod.remainingDuration;
      }
      // 스택 누적
      const maxStacks = mod.maxStacks ?? 1;
      existing.stacks = Math.min((existing.stacks ?? 1) + 1, maxStacks);
    } else {
      statMods.set(mod.sourceId, { stacks: 1, ...mod });
    }

    this._markDirty(mod.stat);
    return this;
  }

  removeModifier(statName: string, sourceId: string): boolean {
    const statMods = this._modifiers.get(statName);
    if (!statMods) return false;
    const deleted = statMods.delete(sourceId);
    if (deleted) {
      this._markDirty(statName);
    }
    return deleted;
  }

  removeModifiersBySource(sourceId: string): void {
    for (const [stat, mods] of this._modifiers) {
      for (const id of [...mods.keys()]) {
        if (id === sourceId || id.startsWith(sourceId)) {
          mods.delete(id);
          this._markDirty(stat);
        }
      }
    }
  }


  getModifiers(statName: string): PipelineStatModifier[] {
    return [...(this._modifiers.get(statName)?.values() ?? [])];
  }

  getAllModifiers(): PipelineStatModifier[] {
    const list: PipelineStatModifier[] = [];
    for (const mods of this._modifiers.values()) {
      list.push(...mods.values());
    }
    return list;
  }

  clearModifiers(statName?: string): void {
    if (statName) {
      if (this._modifiers.delete(statName)) {
        this._markDirty(statName);
      }
    } else {
      for (const stat of this._modifiers.keys()) {
        this._markDirty(stat);
      }
      this._modifiers.clear();
    }
  }

  /** 정의된 모든 스탯 이름 목록 */
  get definedStatNames(): string[] {
    const names = new Set([...this._definitions.keys(), ...this._baseValues.keys()]);
    return [...names];
  }

  /**
   * 모든 활성 스탯의 최종 계산값을 레코드 객체로 반환한다 (UI/인스펙터 바인딩용)
   */
  toRecord(): Record<string, number> {
    const record: Record<string, number> = {};
    for (const name of this.definedStatNames) {
      record[name] = this.get(name);
    }
    return record;
  }

  getAllStats(): Record<string, number> {
    return this.toRecord();
  }

  // ──────────────────────────────────────────────
  // 4단계 파이프라인 계산 & Dirty Caching
  // ──────────────────────────────────────────────

  /**
   * 스탯 최종값을 반환한다. (캐시가 유효하면 O(1) 반환)
   */
  get(statName: string): number {
    if (this._cache.has(statName) && !this._dirty.get(statName)) {
      return this._cache.get(statName)!;
    }

    const breakdown = this.calculateBreakdown(statName);
    this._cache.set(statName, breakdown.finalValue);
    this._dirty.set(statName, false);
    return breakdown.finalValue;
  }


  /**
   * 4단계 파이프라인 상세 연산 분해 결과를 반환한다.
   *  Stage 1: Base (기본값 또는 formula)
   *  Stage 2: Flat Modifiers (합연산 +)
   *  Stage 3: Percent Modifiers (곱연산 %)
   *  Stage 4: Final Amplification (최종 증폭 %)
   */
  calculateBreakdown(statName: string): StatCalculationBreakdown {
    return this._evaluateWithCycleDetection(statName, new Set());
  }

  private _evaluateWithCycleDetection(
    statName: string,
    evaluating: Set<string>,
  ): StatCalculationBreakdown {
    if (evaluating.has(statName)) {
      const chain = [...evaluating, statName].join(' -> ');
      throw new Error(`Circular dependency detected in stat pipeline: ${chain}`);
    }
    evaluating.add(statName);

    const def = this._definitions.get(statName);

    // ── Stage 1: Base Stat ──────────────────────
    let base = this._baseValues.get(statName) ?? def?.base ?? 0;
    if (def?.formula) {
      // formula 실행 시 reader 프록시를 통해 동적 의존성도 추적 가능
      const formulaReader: StatReader = {
        get: (depName: string) => {
          // 동적 의존성 등록
          if (!this._dependents.has(depName)) {
            this._dependents.set(depName, new Set());
          }
          this._dependents.get(depName)!.add(statName);
          return this._evaluateWithCycleDetection(depName, new Set(evaluating)).finalValue;
        },
      };
      base += def.formula(formulaReader);
    }

    // ── Stage 2: Flat Modifiers (합연산 +) ─────────
    const mods = this._modifiers.get(statName);
    let flatSum = 0;
    let percentSum = 0;
    let ampSum = 0;

    if (mods && mods.size > 0) {
      for (const mod of mods.values()) {
        const stacks = mod.stacks ?? 1;
        flatSum += (mod.flat ?? 0) * stacks;
        percentSum += (mod.percent ?? 0) * stacks;
        ampSum += (mod.amplification ?? 0) * stacks;
      }
    }

    const afterFlat = base + flatSum;

    // ── Stage 3: Percent Modifiers (곱연산 %) ─────
    const afterPercent = afterFlat * (1 + percentSum);

    // ── Stage 4: Final Amplification (최종 증폭 %) ──
    let finalValue = afterPercent * (1 + ampSum);

    // 경계값 처리
    if (def?.min !== undefined) {
      finalValue = Math.max(def.min, finalValue);
    }
    if (def?.max !== undefined) {
      finalValue = Math.min(def.max, finalValue);
    }

    evaluating.delete(statName);

    return {
      stat: statName,
      base,
      flatSum,
      afterFlat,
      percentSum,
      afterPercent,
      amplificationSum: ampSum,
      finalValue,
    };
  }

  isDirty(statName: string): boolean {
    return this._dirty.get(statName) ?? true;
  }

  /**
   * 특정 스탯 및 그에 의존하는 모든 다운스트림 스탯을 dirty로 표시
   */
  private _markDirty(statName: string, visited: Set<string> = new Set()): void {
    if (visited.has(statName)) return;
    visited.add(statName);

    this._dirty.set(statName, true);

    const deps = this._dependents.get(statName);
    if (deps) {
      for (const child of deps) {
        this._markDirty(child, visited);
      }
    }
  }

  /**
   * 틱 경과에 따른 모디파이어 만료 처리
   */
  tick(delta: number): Array<{ sourceId: string; stat: string }> {
    const expired: Array<{ sourceId: string; stat: string }> = [];
    let anyExpired = false;

    for (const [stat, mods] of this._modifiers) {
      for (const [id, mod] of mods) {
        if (mod.remainingDuration === undefined) continue;
        mod.remainingDuration -= delta;
        if (mod.remainingDuration <= 0) {
          expired.push({ sourceId: id, stat });
          mods.delete(id);
          this._markDirty(stat);
          anyExpired = true;
        }
      }
    }

    return expired;
  }

  clear(): void {
    this._definitions.clear();
    this._baseValues.clear();
    this._modifiers.clear();
    this._cache.clear();
    this._dirty.clear();
    this._dependents.clear();
  }
}
