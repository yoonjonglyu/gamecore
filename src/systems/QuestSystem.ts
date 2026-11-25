import type { World } from '../core/World';
import type { CoreEvents } from '../events';
import { QuestsComponent, type QuestInstance } from '../components/QuestsComponent';
import { ProgressionComponent } from '../components/ProgressionComponent';
import { ClassComponent } from '../components/ClassComponent';
import { InventoryComponent } from '../components/InventoryComponent';
import { StatsComponent } from '../components/StatsComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';
import { StatModsComponent } from '../components/StatModsComponent';

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
        if (data.killerId !== undefined) {
          this.advanceObjective(data.killerId, undefined, 'kill', 1, { targetId: data.entityId });
        } else {
          // killerId 미지정 시: 사망자 본인 제외 퀘스트 보유 엔티티 대상 검사
          const entities = this._world.queryEntities([QuestsComponent]);
          for (const entity of entities) {
            if (entity.id === data.entityId) continue;
            this.advanceObjective(entity.id, undefined, 'kill', 1, { targetId: data.entityId });
          }
        }
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

        // 메타데이터 필터 검증 (목표가 요구한 모든 metadata 키가 filterMeta와 일치해야 함)
        if (obj.metadata && Object.keys(obj.metadata).length > 0) {
          let filterFailed = false;
          for (const key of Object.keys(obj.metadata)) {
            if (obj.metadata[key] !== undefined && filterMeta?.[key] !== obj.metadata[key]) {
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

          if (res.allCompleted && quest.state === 'completed') {
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
      // 1. 경험치 지급 (이벤트/성장 반영)
      if (rewards.exp && rewards.exp > 0) {
        const prog = entity.get(ProgressionComponent);
        if (prog) {
          const lvlRes = prog.addExp(rewards.exp);
          this._world.events.emit('progression:exp_gained', {
            entityId,
            amount: rewards.exp,
            currentExp: prog.currentExp,
            requiredExp: prog.requiredExp,
            level: prog.level,
          });
          if (lvlRes.leveledUp) {
            const cls = entity.get(ClassComponent);
            if (cls) cls.level = lvlRes.newLevel;
            const stats = entity.get(StatsComponent);
            const statsGained: Record<string, number> = {};
            if (stats && prog.growth) {
              if (prog.growth.maxHp) { stats.maxHp += prog.growth.maxHp * lvlRes.levelsGained; statsGained.maxHp = prog.growth.maxHp * lvlRes.levelsGained; }
              if (prog.growth.maxMp) { stats.maxMp += prog.growth.maxMp * lvlRes.levelsGained; statsGained.maxMp = prog.growth.maxMp * lvlRes.levelsGained; }
              if (prog.growth.attack) { stats.attack += prog.growth.attack * lvlRes.levelsGained; statsGained.attack = prog.growth.attack * lvlRes.levelsGained; }
              if (prog.growth.defense) { stats.defense += prog.growth.defense * lvlRes.levelsGained; statsGained.defense = prog.growth.defense * lvlRes.levelsGained; }
              if (prog.growth.speed) { stats.speed += prog.growth.speed * lvlRes.levelsGained; statsGained.speed = prog.growth.speed * lvlRes.levelsGained; }
            }
            this._world.events.emit('progression:levelup', {
              entityId,
              oldLevel: lvlRes.oldLevel,
              newLevel: lvlRes.newLevel,
              levelsGained: lvlRes.levelsGained,
              statsGained,
            });
          }
        }
      }

      // 2. 인벤토리 아이템 지급
      if (rewards.items && rewards.items.length > 0) {
        const inv = entity.get(InventoryComponent);
        if (inv) {
          for (const item of rewards.items) {
            const ok = inv.add(item.itemId, item.quantity);
            if (ok) {
              this._world.events.emit('inventory:item:added', {
                entityId,
                defId: item.itemId,
                quantity: item.quantity,
              });
            } else {
              this._world.events.emit('inventory:full', { entityId });
            }
          }
        }
      }

      // 3. 영구 스탯 보상 지급
      if (rewards.stats) {
        const mods = entity.get(StatModsComponent);
        const ext = entity.get(ExtendedStatsComponent);
        const stats = entity.get(StatsComponent);
        for (const [stat, val] of Object.entries(rewards.stats)) {
          if (typeof val !== 'number' || val === 0) continue;
          const sourceId = `quest:${quest.id}:${stat}`;
          if (ext) {
            ext.addModifier({ sourceId, stat, flat: val });
          } else if (mods) {
            mods.add({ sourceId, stat, flat: val });
          } else if (stats && stat in stats && typeof (stats as any)[stat] === 'number') {
            (stats as any)[stat] += val;
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
