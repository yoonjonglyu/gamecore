import type { World } from '../core/World';
import type { CoreEvents } from '../events';
import { QuestsComponent, type QuestInstance } from '../components/QuestsComponent';
import { ProgressionComponent } from '../components/ProgressionComponent';
import { InventoryComponent } from '../components/InventoryComponent';

export class QuestSystem {
  private _world: World<CoreEvents>;
  private _unsubscribers: Array<() => void> = [];

  constructor(world: World<any>) {
    this._world = world as World<CoreEvents>;
    this._setupListeners();
  }

  private _setupListeners(): void {
    // 몬스터 처치 이벤트 감지
    this._unsubscribers.push(
      this._world.events.on('stats:died', (data) => {
        // 모든 퀘스트 소유 엔티티에 대해 'kill' 타입 목표 검사
        this._handleGlobalQuestEvent('kill', 1, { targetId: data.entityId });
      })
    );

    // 아이템 획득 이벤트 감지
    this._unsubscribers.push(
      this._world.events.on('inventory:item:added', (data) => {
        this.advanceObjective(data.entityId, undefined, 'collect', data.quantity, { defId: data.defId });
      })
    );
  }

  /**
   * 전역으로 발생한 이벤트에 대해 모든 퀘스트 엔티티의 목표를 갱신합니다.
   */
  private _handleGlobalQuestEvent(type: string, amount: number, metadata?: Record<string, any>): void {
    const entities = this._world.queryEntities([QuestsComponent]);
    for (const entity of entities) {
      this.advanceObjective(entity.id, undefined, type, amount, metadata);
    }
  }

  /**
   * 특정 엔티티의 퀘스트 목표를 전진시킵니다.
   * @param entityId 퀘스트를 보유한 엔티티 ID
   * @param questId 특정 퀘스트 ID (생략 시 활성 퀘스트 전체 중 objectiveType 일치 항목)
   * @param objectiveTypeOrId 목표 타입(kill, collect 등) 또는 구체적인 objectiveId
   * @param amount 증가량
   * @param filterMeta 추가 검증 필터 (예: targetId, defId 등)
   */
  advanceObjective(
    entityId: number,
    questId?: string,
    objectiveTypeOrId?: string,
    amount: number = 1,
    filterMeta?: Record<string, any>
  ): void {
    const entity = this._world.getEntity(entityId);
    if (!entity) return;

    const questsComp = entity.get(QuestsComponent);
    if (!questsComp) return;

    const activeQuests = questId
      ? [questsComp.getQuest(questId)].filter((q): q is QuestInstance => q !== undefined && q.state === 'active')
      : questsComp.getActiveQuests();

    for (const quest of activeQuests) {
      for (const obj of quest.objectives) {
        if (obj.completed) continue;

        // 목표 매칭 (ID 일치 또는 Type 일치)
        const matches =
          !objectiveTypeOrId ||
          obj.id === objectiveTypeOrId ||
          obj.type === objectiveTypeOrId;

        if (!matches) continue;

        // 메타데이터 필터 검증 (예: obj.metadata.targetId 와 filterMeta.targetId 비교)
        if (filterMeta && obj.metadata) {
          let filterFailed = false;
          for (const key of Object.keys(filterMeta)) {
            if (obj.metadata[key] !== undefined && obj.metadata[key] !== filterMeta[key]) {
              filterFailed = true;
              break;
            }
          }
          if (filterFailed) continue;
        }

        const res = questsComp.updateProgress(quest.id, obj.id, amount, 'inc');
        if (res) {
          this._world.events.emit('quest:progress', {
            entityId,
            questId: quest.id,
            objectiveId: obj.id,
            current: obj.current,
            target: obj.target,
            completed: obj.completed,
          });

          if (res.allCompleted) {
            this._world.events.emit('quest:completed', {
              entityId,
              questId: quest.id,
              rewards: quest.rewards,
            });

            if (quest.autoReward) {
              this.grantReward(entityId, quest.id);
            }
          }
        }
      }
    }
  }

  /**
   * 완료된 퀘스트의 보상을 엔티티에 지급합니다.
   */
  grantReward(entityId: number, questId: string): boolean {
    const entity = this._world.getEntity(entityId);
    if (!entity) return false;

    const questsComp = entity.get(QuestsComponent);
    if (!questsComp) return false;

    const quest = questsComp.getQuest(questId);
    if (!quest || quest.state !== 'completed') return false;

    const rewards = quest.rewards;
    if (rewards) {
      // 1. 경험치 지급
      if (rewards.exp && rewards.exp > 0) {
        const prog = entity.get(ProgressionComponent);
        if (prog) {
          prog.addExp(rewards.exp);
        }
      }

      // 2. 인벤토리 아이템 지급
      if (rewards.items && rewards.items.length > 0) {
        const inv = entity.get(InventoryComponent);
        if (inv) {
          for (const item of rewards.items) {
            inv.add(item.itemId, item.quantity);
          }
        }
      }
    }

    questsComp.markRewarded(questId);
    this._world.events.emit('quest:rewarded', {
      entityId,
      questId: quest.id,
      rewards,
    });

    return true;
  }

  destroy(): void {
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
  }
}
