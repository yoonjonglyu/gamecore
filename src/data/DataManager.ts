/**
 * @module data/DataManager
 * 게임의 모든 마스터 데이터를 카테고리별로 관리하는 중앙 매니저.
 * 기본으로 items, skills, blueprints 레지스트리를 제공하며,
 * 필요에 따라 게임 프로젝트 고유의 레지스트리를 추가할 수 있다.
 */

import { Registry, Identifiable } from './Registry';
import { ItemDef } from './ItemDef';
import { SkillDef } from '../skills/SkillDef';
import { EntityBlueprint } from '../factory/Blueprint';

export interface GameDataBundle {
  items?: ItemDef[];
  skills?: SkillDef[];
  blueprints?: EntityBlueprint[];
  custom?: Record<string, Identifiable[]>;
}

export class DataManager {
  readonly items: Registry<ItemDef>;
  readonly skills: Registry<SkillDef>;
  readonly blueprints: Registry<EntityBlueprint>;

  private _customRegistries: Map<string, Registry<any>> = new Map();

  constructor(bundle?: GameDataBundle) {
    this.items = new Registry<ItemDef>();
    this.skills = new Registry<SkillDef>();
    this.blueprints = new Registry<EntityBlueprint>();

    if (bundle) {
      this.loadBundle(bundle);
    }
  }

  /** 번들 데이터 일괄 등록 */
  loadBundle(bundle: GameDataBundle): this {
    if (bundle.items) this.items.registerMany(bundle.items);
    if (bundle.skills) this.skills.registerMany(bundle.skills);
    if (bundle.blueprints) this.blueprints.registerMany(bundle.blueprints);
    if (bundle.custom) {
      for (const [name, items] of Object.entries(bundle.custom)) {
        this.getOrCreateRegistry(name).registerMany(items);
      }
    }
    return this;
  }

  /** 커스텀 레지스트리 생성 또는 기존 반환 */
  getOrCreateRegistry<T extends Identifiable>(name: string): Registry<T> {
    if (!this._customRegistries.has(name)) {
      this._customRegistries.set(name, new Registry<T>());
    }
    return this._customRegistries.get(name)! as Registry<T>;
  }

  /** 커스텀 레지스트리 조회 */
  getRegistry<T extends Identifiable>(name: string): Registry<T> | undefined {
    return this._customRegistries.get(name) as Registry<T> | undefined;
  }

  /** 커스텀 레지스트리 존재 여부 */
  hasRegistry(name: string): boolean {
    return this._customRegistries.has(name);
  }

  /** 전체 레지스트리 초기화 */
  clearAll(): void {
    this.items.clear();
    this.skills.clear();
    this.blueprints.clear();
    for (const reg of this._customRegistries.values()) {
      reg.clear();
    }
  }
}
