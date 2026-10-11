/**
 * @module ai/BehaviorTree
 * 몬스터 패턴, 동료 NPC AI, 오토 배틀러를 위한 경량 비헤이비어 트리(Behavior Tree) 엔진.
 * 0-Dependency 순수 TS.
 *
 * 지원 노드:
 * - 상태: SUCCESS, FAILURE, RUNNING
 * - 합성: Selector (OR), Sequence (AND)
 * - 데코레이터: Inverter (반전), Repeat (반복)
 * - 리프: Condition (조건 검사), Action (액션 실행)
 */

export type NodeStatus = 'SUCCESS' | 'FAILURE' | 'RUNNING';

export interface BTContext {
  blackboard?: any;
  delta?: number;
  [key: string]: any;
}

export abstract class BTNode {
  abstract execute(context: BTContext): NodeStatus;
}

// ──────────────────────────────────────────────
// 합성 노드 (Composites)
// ──────────────────────────────────────────────

/**
 * Selector (Fallback):
 * 자식 중 하나라도 SUCCESS를 반환하면 즉시 SUCCESS 반환.
 * 모두 FAILURE일 때만 FAILURE 반환 (OR 로직).
 */
export class SelectorNode extends BTNode {
  readonly children: BTNode[];

  constructor(children: BTNode[] = []) {
    super();
    this.children = children;
  }

  execute(context: BTContext): NodeStatus {
    for (const child of this.children) {
      const status = child.execute(context);
      if (status !== 'FAILURE') {
        return status;
      }
    }
    return 'FAILURE';
  }
}

/**
 * Sequence:
 * 자식 중 하나라도 FAILURE를 반환하면 즉시 FAILURE 반환.
 * 모두 SUCCESS일 때만 SUCCESS 반환 (AND 로직).
 */
export class SequenceNode extends BTNode {
  readonly children: BTNode[];

  constructor(children: BTNode[] = []) {
    super();
    this.children = children;
  }

  execute(context: BTContext): NodeStatus {
    for (const child of this.children) {
      const status = child.execute(context);
      if (status !== 'SUCCESS') {
        return status;
      }
    }
    return 'SUCCESS';
  }
}

// ──────────────────────────────────────────────
// 데코레이터 노드 (Decorators)
// ──────────────────────────────────────────────

/**
 * Inverter:
 * SUCCESS는 FAILURE로, FAILURE는 SUCCESS로 반전. RUNNING은 유지.
 */
export class InverterNode extends BTNode {
  constructor(readonly child: BTNode) {
    super();
  }

  execute(context: BTContext): NodeStatus {
    const status = this.child.execute(context);
    if (status === 'SUCCESS') return 'FAILURE';
    if (status === 'FAILURE') return 'SUCCESS';
    return status;
  }
}

/**
 * Repeat:
 * 자식을 지정된 횟수(count)만큼 반복 실행.
 */
export class RepeatNode extends BTNode {
  constructor(readonly child: BTNode, readonly count: number = 1) {
    super();
  }

  execute(context: BTContext): NodeStatus {
    for (let i = 0; i < this.count; i++) {
      const status = this.child.execute(context);
      if (status === 'FAILURE') return 'FAILURE';
      if (status === 'RUNNING') return 'RUNNING';
    }
    return 'SUCCESS';
  }
}

// ──────────────────────────────────────────────
// 리프 노드 (Leafs)
// ──────────────────────────────────────────────

export type BTConditionFn = (context: BTContext) => boolean;
export type BTActionFn = (context: BTContext) => NodeStatus | void;

/**
 * Condition:
 * 조건식이 true이면 SUCCESS, false이면 FAILURE를 반환.
 */
export class ConditionNode extends BTNode {
  constructor(private _predicate: BTConditionFn) {
    super();
  }

  execute(context: BTContext): NodeStatus {
    return this._predicate(context) ? 'SUCCESS' : 'FAILURE';
  }
}

/**
 * Action:
 * 실제 행동을 수행하고 상태를 반환 (void 반환 시 기본 SUCCESS).
 */
export class ActionNode extends BTNode {
  constructor(private _action: BTActionFn) {
    super();
  }

  execute(context: BTContext): NodeStatus {
    const res = this._action(context);
    return res ?? 'SUCCESS';
  }
}

// ──────────────────────────────────────────────
// 실행기 (Runner)
// ──────────────────────────────────────────────

export class BehaviorTreeRunner {
  constructor(readonly root: BTNode, readonly context: BTContext = {}) {}

  /**
   * 트리 틱을 1회 실행합니다.
   */
  tick(delta?: number): NodeStatus {
    if (delta !== undefined) {
      this.context.delta = delta;
    }
    return this.root.execute(this.context);
  }
}
