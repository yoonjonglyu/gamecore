/**
 * @module components/ExtendedStatsComponent
 * 선언적 커스텀 스탯 파이프라인(StatPipeline)을 탑재한 확장 스탯 컴포넌트.
 *
 * 기존 고정 필드(maxHp, attack 등)에 얽매이지 않고,
 * 게임별로 임의의 스탯(int, wis, matk, critRate 등)과 의존성 수식,
 * 4단계 연산(Base -> Flat -> Percent -> Amplification)을 지원한다.
 */

import { Component } from '../core/Component';
import {
  StatPipeline,
  StatDefinition,
  PipelineStatModifier,
  StatCalculationBreakdown,
} from '../stats/StatPipeline';

export interface ExtendedStatsInit {
  baseStats?: Record<string, number>;
  definitions?: StatDefinition[];
  currentResources?: Record<string, number>; // e.g. { hp: 100, mp: 50 }
}

export class ExtendedStatsComponent extends Component {
  readonly pipeline: StatPipeline = new StatPipeline();

  /** 현재 소모성 자원 (hp, mp, stamina 등) */
  private _resources: Map<string, number> = new Map();

  constructor(init: ExtendedStatsInit = {}) {
    super();

    if (init.definitions) {
      for (const def of init.definitions) {
        this.pipeline.defineStat(def);
      }
    }

    if (init.baseStats) {
      for (const [stat, value] of Object.entries(init.baseStats)) {
        this.pipeline.setBase(stat, value);
      }
    }

    if (init.currentResources) {
      for (const [res, value] of Object.entries(init.currentResources)) {
        this._resources.set(res, value);
      }
    }
  }

  // ──────────────────────────────────────────────
  // 스탯 정의 및 계산 위임
  // ──────────────────────────────────────────────

  defineStat(def: StatDefinition): this {
    this.pipeline.defineStat(def);
    return this;
  }

  setBase(stat: string, value: number): this {
    this.pipeline.setBase(stat, value);
    return this;
  }

  getBase(stat: string): number {
    return this.pipeline.getBase(stat);
  }

  addModifier(mod: PipelineStatModifier): this {
    this.pipeline.addModifier(mod);
    return this;
  }

  removeModifier(stat: string, sourceId: string): boolean {
    return this.pipeline.removeModifier(stat, sourceId);
  }

  removeModifiersBySource(sourceId: string): void {
    this.pipeline.removeModifiersBySource(sourceId);
  }

  /**
   * 스탯 최종 계산값 조회 (캐시 기반 O(1))
   */
  get(stat: string): number {
    return this.pipeline.get(stat);
  }

  getDetailed(stat: string): StatCalculationBreakdown {
    return this.pipeline.calculateBreakdown(stat);
  }

  isDirty(stat: string): boolean {
    return this.pipeline.isDirty(stat);
  }

  clearModifiers(stat?: string): this {
    this.pipeline.clearModifiers(stat);
    return this;
  }


  get definedStatNames(): string[] {
    return this.pipeline.definedStatNames;
  }

  toRecord(): Record<string, number> {
    return this.pipeline.toRecord();
  }

  getAllStats(): Record<string, number> {
    return this.toRecord();
  }

  /** 모든 현재 자원 상태를 Record로 반환 */
  get allResources(): Record<string, number> {
    return Object.fromEntries(this._resources.entries());
  }

  // ──────────────────────────────────────────────
  // 동적 자원 (HP, MP 등) 관리
  // ──────────────────────────────────────────────


  hasResource(resource: string): boolean {
    return this._resources.has(resource) || this.pipeline.hasStat(resource);
  }

  getResource(resource: string, maxStatName?: string): number {
    if (!this._resources.has(resource)) {
      // 초기값이 없으면 해당 max 스탯값 또는 0
      const maxVal = maxStatName ? this.get(maxStatName) : 100;
      this._resources.set(resource, maxVal);
    }
    return this._resources.get(resource)!;
  }

  setResource(resource: string, value: number, maxStatName?: string): void {
    const maxVal = maxStatName ? this.get(maxStatName) : undefined;
    let nextVal = Math.max(0, value);
    if (maxVal !== undefined) {
      nextVal = Math.min(maxVal, nextVal);
    }
    this._resources.set(resource, nextVal);
  }

  modifyResource(resource: string, delta: number, maxStatName?: string): { prev: number; next: number } {
    const prev = this.getResource(resource, maxStatName);
    this.setResource(resource, prev + delta, maxStatName);
    const next = this.getResource(resource, maxStatName);
    return { prev, next };
  }

  // ──────────────────────────────────────────────
  // 편의 속성 (HP / MP 기본 지원)
  // ──────────────────────────────────────────────

  get hp(): number {
    return this.getResource('hp', 'maxHp');
  }

  set hp(val: number) {
    this.setResource('hp', val, 'maxHp');
  }

  get maxHp(): number {
    return this.pipeline.hasStat('maxHp') ? this.get('maxHp') : 100;
  }

  get mp(): number {
    return this.getResource('mp', 'maxMp');
  }

  set mp(val: number) {
    this.setResource('mp', val, 'maxMp');
  }

  get maxMp(): number {
    return this.pipeline.hasStat('maxMp') ? this.get('maxMp') : 50;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get hpRatio(): number {
    const max = this.maxHp;
    return max > 0 ? this.hp / max : 0;
  }
}
