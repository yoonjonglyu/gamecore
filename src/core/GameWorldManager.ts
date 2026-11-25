/**
 * @module core/GameWorldManager
 * World, EventBus, Seeded PRNG 및 주요 시스템들을 한 곳에서 총괄하는 고수준 게임 상태 엔진 매니저.
 * 반복적인 보일러플레이트 코드 없이 선언적으로 게임 월드를 부트스트랩할 수 있다.
 */

import { World } from './World';
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
import { CueQueue } from '../combat/CueProtocol';
import { DataManager } from '../data/DataManager';
import { SaveManager, DeserializationResult } from '../serialization/SaveManager';
import { SerializeOptions, WorldSerializer } from '../serialization/WorldSerializer';
import { InventoryComponent } from '../components/InventoryComponent';
import { FSMComponent } from '../components/FSMComponent';
import { ReplayRecorder, ReplayRecorderOptions } from '../replay/ReplayRecorder';
import { ReplayData } from '../replay/types';
import {
  CommandBus,
  CoreCommands,
  CommandDispatchResult,
} from '../simulation/CommandBus';
import { FixedStepRunner, AdvanceResult } from '../simulation/FixedStepRunner';

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
  /** 고정 타임스텝 간격(ms). 기본값: 16 */
  stepMs?: number;
  /** 프레임당 최대 고정 스텝 수. 기본값: 10 */
  maxStepsPerFrame?: number;
  /** 커스텀 CommandBus 인스턴스 (선택) */
  commands?: CommandBus<CoreCommands>;
  /** 연출 큐(CueQueue) 연동 인스턴스 (선택) */
  cueQueue?: CueQueue;
  /** 마스터 데이터 매니저(DataManager) 연동 인스턴스 (선택) */
  data?: DataManager;
}

export class GameWorldManager<Events extends EventMap = CoreEvents> {
  readonly world: World<Events>;
  readonly random: SeededRandom;
  readonly commands: CommandBus<CoreCommands>;
  readonly runner: FixedStepRunner<Events, CoreCommands>;
  readonly cues?: CueQueue;
  readonly data?: DataManager;
  private readonly _initialSeed: number | string;

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

    if (options.seed === undefined && !options.random) {
      console.warn(
        '[GameCore] GameWorldManager: No seed provided. Initialized with non-deterministic Date.now(). Provide an explicit seed for reproducible simulation.',
      );
    }

    const resolvedSeed = options.seed ?? Date.now();
    this._initialSeed = resolvedSeed;
    this.random = options.random ?? new SeededRandom(resolvedSeed);
    this.cues = options.cueQueue;
    this.data = options.data;

    this.world = new World<Events>({
      bus,
      random: this.random,
    });

    this.commands = options.commands ?? new CommandBus<CoreCommands>();
    this.runner = new FixedStepRunner<Events, CoreCommands>(this.world, {
      stepMs: options.stepMs,
      maxStepsPerFrame: options.maxStepsPerFrame,
      commands: this.commands,
    });

    const shouldAutoRegister = options.autoRegisterDefaults ?? true;
    if (shouldAutoRegister) {
      this._registerDefaultSystems(options.rounding);
      this._registerDefaultCommandHandlers();
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
    if (this.cues) {
      this.statusEffectSystem.setCueQueue(this.cues);
    }
    this.progressionSystem = new ProgressionSystem();
    this.lootSystem = new LootSystem(this.progressionSystem, this.random);
    this.equipmentSystem = new EquipmentSystem(this.data ?? new DataManager(), undefined, this.statModSystem);
    this.movementSystem = new MovementSystem();
    this.spatialGridSystem = new SpatialGridSystem();
    this.turnSystem = new TurnSystem();
    this.fsmSystem = new FSMSystem();
    this.questSystem = new QuestSystem(this.world as any);

    this.skillSystem = new SkillSystem(
      undefined,
      this.statModSystem,
      undefined,
      this.statusEffectSystem,
      this.random,
    );
    this.combatSystem = new CombatSystem({
      random: this.random,
      rounding,
      cueQueue: this.cues,
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

  private _registerDefaultCommandHandlers(): void {
    this.commands
      .register('combat:attack', (req) => {
        if (!this.combatSystem) throw new Error('CombatSystem is not registered');
        this.combatSystem.requestAttack(req);
      })
      .register('skill:use', (req) => {
        if (!this.skillSystem) throw new Error('SkillSystem is not registered');
        this.skillSystem.useSkill(req);
      })
      .register('movement:move', (req) => {
        if (!this.movementSystem) throw new Error('MovementSystem is not registered');
        this.movementSystem.requestMove(req.entityId, req.targetX, req.targetY);
      })
      .register('equipment:equip', (req) => {
        if (!this.equipmentSystem) throw new Error('EquipmentSystem is not registered');
        this.equipmentSystem.requestEquip(req);
      })
      .register('equipment:unequip', (req) => {
        if (!this.equipmentSystem) throw new Error('EquipmentSystem is not registered');
        this.equipmentSystem.requestUnequip(req);
      })
      .register('inventory:add', (req) => {
        const entity = this.world.getEntity(req.entityId);
        const inv = entity?.get(InventoryComponent);
        if (!inv) throw new Error(`InventoryComponent not found on entity ${req.entityId}`);
        const qty = req.quantity ?? 1;
        if (inv.add(req.itemId, qty)) {
          (this.world.bus as unknown as EventBus<CoreEvents>).emit('inventory:item:added', {
            entityId: req.entityId,
            defId: req.itemId,
            quantity: qty,
          });
        } else {
          (this.world.bus as unknown as EventBus<CoreEvents>).emit('inventory:full', {
            entityId: req.entityId,
          });
        }
      })
      .register('inventory:remove', (req) => {
        const entity = this.world.getEntity(req.entityId);
        const inv = entity?.get(InventoryComponent);
        if (!inv) throw new Error(`InventoryComponent not found on entity ${req.entityId}`);
        const qty = req.quantity ?? 1;
        if (inv.remove(req.itemId, qty)) {
          (this.world.bus as unknown as EventBus<CoreEvents>).emit('inventory:item:removed', {
            entityId: req.entityId,
            defId: req.itemId,
            quantity: qty,
          });
        }
      })
      .register('fsm:transition', (req) => {
        const entity = this.world.getEntity(req.entityId);
        const fsm = entity?.get(FSMComponent);
        if (!fsm) throw new Error(`FSMComponent not found on entity ${req.entityId}`);
        if (!fsm.transitionTo(req.nextState, req.force ?? false)) {
          throw new Error(`FSM transition to '${req.nextState}' rejected for entity ${req.entityId}`);
        }
      })
      .register('turn:end', (req) => {
        if (!this.turnSystem) throw new Error('TurnSystem is not registered');
        if (!this.turnSystem.endTurn(req.entityId)) {
          throw new Error(`Entity ${req.entityId} is not the active turn owner`);
        }
      });
  }

  dispatch<K extends keyof CoreCommands>(
    type: K,
    payload: CoreCommands[K],
    options?: { actorId?: string | number; tick?: number },
  ): CommandDispatchResult {
    return this.commands.dispatch(type, payload, {
      actorId: options?.actorId,
      tick: options?.tick ?? this.runner.tick + 1,
    });
  }

  enqueue<K extends keyof CoreCommands>(
    type: K,
    payload: CoreCommands[K],
    options?: { actorId?: string | number; tick?: number },
  ): this {
    this.commands.enqueue(type, payload, options);
    return this;
  }

  /**
   * 고정 타임스텝 틱을 `count`회 실행한다 (`runner.step` 위임).
   */
  step(count = 1): number {
    return this.runner.step(count);
  }

  /**
   * 가변 프레임 델타를 누적하여 고정 스텝 단위로 시뮬레이션을 진행한다 (`runner.advance` 위임).
   */
  advance(frameDeltaMs: number): AdvanceResult {
    return this.runner.advance(frameDeltaMs);
  }

  /**
   * 커맨드 버스 및 체크포인트 자동 리플레이 녹화를 시작한다.
   */
  startRecording(
    options?: ReplayRecorderOptions & { checkpointInterval?: number },
  ): ReplayRecorder {
    const recorder = new ReplayRecorder(this._initialSeed, options);
    this.runner.setRecorder(recorder, options?.checkpointInterval ?? 0);
    return recorder;
  }

  /**
   * 진행 중인 리플레이 녹화를 종료하고 직렬화된 ReplayData를 반환한다.
   */
  stopRecording(): ReplayData | undefined {
    const recorder = this.runner.recorder;
    if (!recorder) return undefined;
    this.runner.setRecorder(undefined);
    return JSON.parse(recorder.toJSON()) as ReplayData;
  }

  /**
   * 커스텀 모듈/플러그인 초기화 함수를 체이닝 방식으로 등록한다.
   */
  registerModule(plugin: (manager: this) => void): this {
    plugin(this);
    return this;
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
    this.commands.clear();
    this.world.destroy();
  }

  /**
   * 현재 월드를 HMAC 서명 세이브 JSON 문자열로 저장합니다.
   */
  save(
    secretKey?: string,
    options?: SerializeOptions & { metadata?: Record<string, any> },
  ): string {
    return SaveManager.serialize(this.world, secretKey, SaveManager.currentVersion, options);
  }

  /**
   * 세이브 데이터를 현재 월드에 복원합니다.
   */
  load(
    payload: string,
    secretKey?: string,
    options?: { allowLegacySignature?: boolean; clearWorld?: boolean; serializer?: WorldSerializer },
  ): DeserializationResult {
    return SaveManager.deserialize(payload, this.world, secretKey, options);
  }
}
