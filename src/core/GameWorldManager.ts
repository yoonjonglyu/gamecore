/**
 * @module core/GameWorldManager
 * World, EventBus, Seeded PRNG 및 주요 시스템들을 한 곳에서 총괄하는 고수준 게임 상태 엔진 매니저.
 * 반복적인 보일러플레이트 코드 없이 선언적으로 게임 월드를 부트스트랩할 수 있다.
 */

import { World, WorldOptions } from './World';
import { EventBus, EventMap } from './EventBus';
import { System } from './System';
import { SeededRandom } from '../math/SeededRandom';
import { CoreEvents } from '../events';
import { CombatSystem } from '../systems/CombatSystem';
import { SkillSystem } from '../systems/SkillSystem';
import { StatusEffectSystem } from '../systems/StatusEffectSystem';
import { StatModSystem } from '../systems/StatModSystem';
import { EquipmentSystem } from '../systems/EquipmentSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { LootSystem } from '../systems/LootSystem';
import { MovementSystem } from '../spatial/MovementSystem';
import { SpatialGridSystem } from '../spatial/SpatialGridSystem';
import { TurnSystem } from '../systems/TurnSystem';
import { FSMSystem } from '../systems/FSMSystem';
import { QuestSystem } from '../systems/QuestSystem';
import { CombatRoundingConfig } from '../math/RoundingPolicy';

export interface GameWorldManagerOptions<Events extends EventMap = CoreEvents> {
  /** 시드 기반 결정론적 난수 시드 (number 또는 string) */
  seed?: number | string;
  /** 커스텀 PRNG 인스턴스 */
  random?: SeededRandom;
  /** 커스텀 EventBus */
  bus?: EventBus<Events>;
  /** 기본 핵심 시스템 자동 등록 여부 (기본: true) */
  autoRegisterDefaults?: boolean;
  /** 전투 시스템 라운딩 정책 */
  rounding?: CombatRoundingConfig;
  /** 추가로 등록할 커스텀 시스템 목록 */
  systems?: System<Events>[];
}

export class GameWorldManager<Events extends EventMap = CoreEvents> {
  readonly world: World<Events>;
  readonly random: SeededRandom;

  // 내장 핵심 시스템 참조 (autoRegisterDefaults = true 시 자동 등록)
  combatSystem?: CombatSystem;
  skillSystem?: SkillSystem;
  statusEffectSystem?: StatusEffectSystem;
  statModSystem?: StatModSystem;
  equipmentSystem?: EquipmentSystem;
  progressionSystem?: ProgressionSystem;
  lootSystem?: LootSystem;
  movementSystem?: MovementSystem;
  turnSystem?: TurnSystem;
  fsmSystem?: FSMSystem;
  questSystem?: QuestSystem;
  spatialGridSystem?: SpatialGridSystem;

  constructor(options: GameWorldManagerOptions<Events> = {}) {
    const bus = options.bus ?? new EventBus<Events>();
    this.random = options.random ?? new SeededRandom(options.seed ?? Date.now());

    this.world = new World<Events>({
      bus,
      random: this.random,
    });

    const shouldAutoRegister = options.autoRegisterDefaults ?? true;
    if (shouldAutoRegister) {
      this._registerDefaultSystems(options.rounding);
    }

    if (options.systems) {
      for (const sys of options.systems) {
        this.world.addSystem(sys);
      }
    }
  }

  get bus(): EventBus<Events> {
    return this.world.bus;
  }

  private _registerDefaultSystems(rounding?: CombatRoundingConfig): void {
    this.statModSystem = new StatModSystem();
    this.statusEffectSystem = new StatusEffectSystem();
    this.progressionSystem = new ProgressionSystem();
    this.lootSystem = new LootSystem(this.progressionSystem);
    this.equipmentSystem = new EquipmentSystem();
    this.movementSystem = new MovementSystem();
    this.spatialGridSystem = new SpatialGridSystem();
    this.turnSystem = new TurnSystem();
    this.fsmSystem = new FSMSystem();
    this.questSystem = new QuestSystem(this.world as any);

    this.skillSystem = new SkillSystem(undefined, this.statModSystem);
    this.combatSystem = new CombatSystem({
      random: this.random,
      rounding,
    });

    // 시스템 우선순위 설정
    // 높은 우선순위가 먼저 실행됨
    this.turnSystem.priority = 100;
    this.fsmSystem.priority = 95;
    this.statusEffectSystem.priority = 90;
    this.statModSystem.priority = 85;
    this.skillSystem.priority = 70;
    this.combatSystem.priority = 60;
    this.equipmentSystem.priority = 50;
    this.lootSystem.priority = 40;
    this.progressionSystem.priority = 30;
    this.movementSystem.priority = 20;
    this.spatialGridSystem.priority = 15;

    this.world
      .addSystem(this.turnSystem as unknown as System<Events>)
      .addSystem(this.fsmSystem as unknown as System<Events>)
      .addSystem(this.statusEffectSystem as unknown as System<Events>)
      .addSystem(this.statModSystem as unknown as System<Events>)
      .addSystem(this.skillSystem as unknown as System<Events>)
      .addSystem(this.combatSystem as unknown as System<Events>)
      .addSystem(this.equipmentSystem as unknown as System<Events>)
      .addSystem(this.lootSystem as unknown as System<Events>)
      .addSystem(this.progressionSystem as unknown as System<Events>)
      .addSystem(this.movementSystem as unknown as System<Events>)
      .addSystem(this.spatialGridSystem as unknown as System<Events>);
  }

  /**
   * 게임 루프 틱 실행
   * @param delta 경과 시간 또는 턴 수
   * @param mode 'realtime' | 'turn'
   */
  update(delta: number, mode: 'turn' | 'realtime' = 'realtime'): void {
    this.world.update(delta, mode);
  }

  /**
   * 관리자 및 월드 리소스 파괴
   */
  destroy(): void {
    this.questSystem?.destroy();
    this.world.destroy();
  }
}
