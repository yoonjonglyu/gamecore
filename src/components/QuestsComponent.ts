import { Component } from '../core/Component';

export type QuestState = 'available' | 'active' | 'completed' | 'rewarded' | 'failed';

export interface QuestObjective {
  id: string;
  description?: string;
  type?: 'kill' | 'collect' | 'reach' | 'interact' | 'custom' | string;
  target: number;
  current: number;
  completed: boolean;
  metadata?: Record<string, any>;
}

export interface QuestReward {
  exp?: number;
  items?: Array<{ itemId: string | number; quantity: number }>;
  stats?: Record<string, number>;
  custom?: Record<string, any>;
}

export interface QuestDef {
  id: string;
  title: string;
  description?: string;
  objectives: Array<Omit<QuestObjective, 'current' | 'completed'> & { current?: number; completed?: boolean }>;
  rewards?: QuestReward;
  autoComplete?: boolean;
  autoReward?: boolean;
  state?: QuestState;
  metadata?: Record<string, any>;
}

export interface QuestInstance {
  id: string;
  title: string;
  description?: string;
  objectives: QuestObjective[];
  rewards?: QuestReward;
  autoComplete: boolean;
  autoReward: boolean;
  state: QuestState;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, any>;
}

export class QuestsComponent extends Component {
  static readonly type = 'Quests';
  readonly type = 'Quests';

  private _quests: Map<string, QuestInstance> = new Map();

  constructor(initialQuests: QuestDef[] = []) {
    super();
    for (const q of initialQuests) {
      this.addQuest(q);
    }
  }

  addQuest(def: QuestDef): QuestInstance {
    const instance: QuestInstance = {
      id: def.id,
      title: def.title,
      description: def.description,
      objectives: def.objectives.map((obj) => ({
        id: obj.id,
        description: obj.description,
        type: obj.type ?? 'custom',
        target: obj.target,
        current: obj.current ?? 0,
        completed: obj.completed ?? (obj.current ?? 0) >= obj.target,
        metadata: obj.metadata,
      })),
      rewards: def.rewards,
      autoComplete: def.autoComplete ?? true,
      autoReward: def.autoReward ?? false,
      state: def.state ?? 'active',
      startedAt: Date.now(),
      metadata: def.metadata,
    };

    this._quests.set(def.id, instance);
    return instance;
  }

  getQuest(questId: string): QuestInstance | undefined {
    return this._quests.get(questId);
  }

  getAllQuests(): QuestInstance[] {
    return Array.from(this._quests.values());
  }

  getActiveQuests(): QuestInstance[] {
    return this.getAllQuests().filter((q) => q.state === 'active');
  }

  getCompletedQuests(): QuestInstance[] {
    return this.getAllQuests().filter((q) => q.state === 'completed' || q.state === 'rewarded');
  }

  hasQuest(questId: string): boolean {
    return this._quests.has(questId);
  }

  removeQuest(questId: string): boolean {
    return this._quests.delete(questId);
  }

  /**
   * 퀘스트의 특정 목표 진행도를 갱신합니다.
   * 모든 목표가 완료되면 autoComplete 플래그에 따라 자동으로 'completed' 상태로 전이됩니다.
   */
  updateProgress(
    questId: string,
    objectiveId: string,
    amount: number,
    mode: 'inc' | 'set' = 'inc'
  ): { quest: QuestInstance; objective: QuestObjective; allCompleted: boolean } | undefined {
    const quest = this._quests.get(questId);
    if (!quest || quest.state !== 'active') return undefined;

    const objective = quest.objectives.find((obj) => obj.id === objectiveId);
    if (!objective) return undefined;

    if (mode === 'inc') {
      objective.current += amount;
    } else {
      objective.current = amount;
    }

    if (objective.current >= objective.target) {
      objective.current = objective.target;
      objective.completed = true;
    }

    const allCompleted = quest.objectives.every((obj) => obj.completed);
    if (allCompleted && quest.autoComplete) {
      quest.state = 'completed';
      quest.completedAt = Date.now();
    }

    return { quest, objective, allCompleted };
  }

  completeQuest(questId: string): boolean {
    const quest = this._quests.get(questId);
    if (!quest || quest.state !== 'active') return false;

    for (const obj of quest.objectives) {
      obj.current = obj.target;
      obj.completed = true;
    }
    quest.state = 'completed';
    quest.completedAt = Date.now();
    return true;
  }

  markRewarded(questId: string): boolean {
    const quest = this._quests.get(questId);
    if (!quest || quest.state !== 'completed') return false;

    quest.state = 'rewarded';
    return true;
  }

  toJSON(): Record<string, any> {
    return {
      quests: Array.from(this._quests.values()),
    };
  }

  static fromJSON(data: { quests: QuestInstance[] }): QuestsComponent {
    const comp = new QuestsComponent();
    if (Array.isArray(data.quests)) {
      for (const q of data.quests) {
        comp._quests.set(q.id, { ...q });
      }
    }
    return comp;
  }
}
