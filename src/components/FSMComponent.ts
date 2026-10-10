/**
 * @module components/FSMComponent
 * 엔티티의 행동 유한 상태 머신(FSM) 컴포넌트.
 * Idle, Move, Attack, Casting, Stunned, Dead 등의 상태 전이 및 배타적 플래그(canMove, canCast, canAttack)를 관리한다.
 */

import { Component } from '../core/Component';

export interface StateConfig {
  name: string;
  canMove?: boolean;
  canCast?: boolean;
  canAttack?: boolean;
  /** 해당 상태의 지속 시간 ms (지정 시 시간 경과 후 fallbackState/autoTransitionTo로 자동 전이) */
  duration?: number;
  /** duration 만료 시 복귀할 상태 (기본값: 'idle') */
  fallbackState?: string;
  /** fallbackState의 별칭 */
  autoTransitionTo?: string;
  /** 전이 가능한 대상 상태 목록 (지정하지 않으면 모든 상태로 전이 허용) */
  allowedTransitions?: string[];
  custom?: Record<string, any>;
}

export type FSMStateConfig = StateConfig;
export type StateTransitionRule = StateConfig;

export interface FSMProps {
  initialState?: string;
  states?: Record<string, Partial<StateConfig>>;
}

export interface FSMSerializedState {
  currentState: string;
  previousState?: string;
  stateTimer: number;
  states: StateConfig[];
}

export class FSMComponent extends Component {
  static readonly type = 'FSM';
  readonly type = 'FSM';

  private _currentState: string;
  private _previousState?: string;
  private _stateTimer: number = 0;
  private _states: Map<string, StateConfig> = new Map();

  constructor(props: FSMProps = {}) {
    super();
    this._currentState = props.initialState ?? 'idle';

    // 기본 idle 상태 보장
    this.registerState({
      name: 'idle',
      canMove: true,
      canCast: true,
      canAttack: true,
    });

    if (props.states) {
      for (const [name, cfg] of Object.entries(props.states)) {
        this.registerState({ name, ...cfg });
      }
    }
  }

  registerState(config: Partial<StateConfig> & { name: string }): this {
    const fullConfig: StateConfig = {
      name: config.name,
      canMove: config.canMove ?? true,
      canCast: config.canCast ?? true,
      canAttack: config.canAttack ?? true,
      duration: config.duration,
      fallbackState: config.fallbackState ?? config.autoTransitionTo ?? 'idle',
      autoTransitionTo: config.autoTransitionTo ?? config.fallbackState ?? 'idle',
      allowedTransitions: config.allowedTransitions,
      custom: config.custom,
    };
    this._states.set(config.name, fullConfig);
    return this;
  }

  get currentState(): string {
    return this._currentState;
  }

  get previousState(): string | undefined {
    return this._previousState;
  }

  get stateTimer(): number {
    return this._stateTimer;
  }

  get currentConfig(): StateConfig | undefined {
    return this._states.get(this._currentState);
  }

  get canMove(): boolean {
    return this.currentConfig?.canMove ?? true;
  }

  get canCast(): boolean {
    return this.currentConfig?.canCast ?? true;
  }

  get canAttack(): boolean {
    return this.currentConfig?.canAttack ?? true;
  }

  /**
   * 상태 전이를 시도한다. 전이 규칙을 검증하며, force가 true이면 강제 전이한다.
   * @returns 전이 성공 여부
   */
  transitionTo(nextState: string, force: boolean = false): boolean {
    if (this._currentState === nextState) return false;

    // 등록되지 않은 상태로의 전이 차단 (force가 아닌 경우)
    if (!force && !this._states.has(nextState)) {
      return false;
    }

    const currentCfg = this.currentConfig;
    if (!force && currentCfg?.allowedTransitions) {
      if (!currentCfg.allowedTransitions.includes(nextState)) {
        return false;
      }
    }

    this._previousState = this._currentState;
    this._currentState = nextState;
    this._stateTimer = 0;
    return true;
  }

  /** @internal FSMSystem 전용 틱 메서드 */
  _tick(delta: number): { changed: boolean; prev?: string; current: string } {
    this._stateTimer += delta;
    const cfg = this.currentConfig;

    if (cfg?.duration !== undefined && this._stateTimer >= cfg.duration) {
      const fallback = cfg.fallbackState ?? cfg.autoTransitionTo ?? 'idle';
      const prev = this._currentState;
      this.transitionTo(fallback, true);
      return { changed: true, prev, current: this._currentState };
    }

    return { changed: false, current: this._currentState };
  }

  toJSON(): FSMSerializedState {
    return {
      currentState: this._currentState,
      previousState: this._previousState,
      stateTimer: this._stateTimer,
      states: Array.from(this._states.values()),
    };
  }

  static fromJSON(data: FSMSerializedState): FSMComponent {
    const statesMap: Record<string, StateConfig> = {};
    if (Array.isArray(data.states)) {
      for (const s of data.states) {
        statesMap[s.name] = s;
      }
    }
    const comp = new FSMComponent({
      initialState: data.currentState,
      states: statesMap,
    });
    comp._previousState = data.previousState;
    comp._stateTimer = data.stateTimer ?? 0;
    return comp;
  }
}
