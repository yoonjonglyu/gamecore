/**
 * @module dialogue/DialogueTreeEngine
 * 스토리 기반 게임, 비주얼 노벨, 퀘스트 NPC 대화 및 호감도 분기 선택지를 위한 대화 트리 엔진.
 * 0-Dependency 순수 TS.
 *
 * 지원 기능:
 * 1) 노드 기반 대화 흐름 (speaker, text, next, cueEffect)
 * 2) 조건부 분기 선택지 (친밀도/플래그 검사)
 * 3) 선택지 클릭 시 콜백 (호감도 증감, 아이템 지급 등)
 * 4) 전역 Blackboard 플래그 연동 지원
 */

import { Blackboard } from '../core/Blackboard';

export interface DialogueContext {
  /** 전역 블랙보드 (스토리 플래그, 챕터, 호감도 등 저장) */
  blackboard?: Blackboard;
  /** 현재 세션 임시 메모리/변수 */
  variables: Map<string, any>;
  /** 사용자 정의 메타데이터 */
  custom?: Record<string, any>;
}

export interface DialogueChoice {
  id: string;
  text: string;
  /** 이동할 다음 대화 노드 ID */
  targetNodeId: string;
  /** 선택지 노출/활성화 조건 (false 반환 시 선택지 숨김) */
  condition?: (context: DialogueContext) => boolean;
  /** 선택 시 실행될 콜백 */
  onSelect?: (context: DialogueContext) => void;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  /** 연출 큐 효과 식별자 (예: 'cg:happy', 'sfx:cheer') */
  cueEffect?: string;
  /** 다음 노드 ID (선택지가 없을 때 단방향 진행용) */
  next?: string;
  /** 분기 선택지 목록 */
  choices?: DialogueChoice[];
  /** 노드 진입 시 실행될 콜백 */
  onEnter?: (context: DialogueContext) => void;
}

export interface DialogueTreeData {
  id: string;
  initialNodeId: string;
  nodes: Record<string, DialogueNode>;
}

export class DialogueSession {
  readonly tree: DialogueTreeData;
  readonly context: DialogueContext;
  private _currentNodeId: string;
  private _isFinished = false;

  constructor(tree: DialogueTreeData, blackboard?: Blackboard, custom?: Record<string, any>) {
    this.tree = tree;
    this.context = {
      blackboard,
      variables: new Map(),
      custom,
    };
    this._currentNodeId = tree.initialNodeId;
    this._triggerEnter();
  }

  get currentNode(): DialogueNode | undefined {
    return this.tree.nodes[this._currentNodeId];
  }

  get currentNodeId(): string {
    return this._currentNodeId;
  }

  get isFinished(): boolean {
    return this._isFinished;
  }

  /**
   * 조건(condition)을 만족하여 현재 유저에게 노출 가능한 유효 선택지 목록을 반환합니다.
   */
  get availableChoices(): DialogueChoice[] {
    const node = this.currentNode;
    if (!node || !node.choices) return [];
    return node.choices.filter((choice) => {
      if (!choice.condition) return true;
      return choice.condition(this.context);
    });
  }

  /**
   * 선택지를 선택하여 다음 노드로 이동합니다.
   */
  selectChoice(choiceId: string): DialogueNode | null {
    if (this._isFinished) return null;

    const choice = this.availableChoices.find((c) => c.id === choiceId);
    if (!choice) return null;

    if (choice.onSelect) {
      choice.onSelect(this.context);
    }

    this._transitionTo(choice.targetNodeId);
    return this.currentNode ?? null;
  }

  /**
   * 단방향 대화(next 필드가 지정된 경우)에서 다음 대사로 진행합니다.
   */
  next(): DialogueNode | null {
    if (this._isFinished) return null;

    const node = this.currentNode;
    if (!node || !node.next) {
      this._isFinished = true;
      return null;
    }

    this._transitionTo(node.next);
    return this.currentNode ?? null;
  }

  private _transitionTo(nodeId: string): void {
    if (!this.tree.nodes[nodeId]) {
      this._isFinished = true;
      return;
    }

    this._currentNodeId = nodeId;
    this._triggerEnter();
  }

  private _triggerEnter(): void {
    const node = this.currentNode;
    if (node && node.onEnter) {
      node.onEnter(this.context);
    }
  }
}
