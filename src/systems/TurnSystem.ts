/**
 * @module systems/TurnSystem
 * 턴제 전투의 라운드(Round)와 턴(Turn) 순서를 관리하는 오케스트레이터 시스템.
 *
 * 주요 기능:
 *  - 속도(Stats.speed) 또는 TurnComponent.initiative 기반으로 턴 순서 정렬
 *  - 사망한 엔티티(StatsComponent.isDead) 턴 스킵
 *  - startRound(), nextTurn(), endTurn()을 통한 턴 진행
 *  - 턴 시작 시 TurnComponent.resetAP() 호출
 *  - 라운드 및 턴 라이프사이클 이벤트 발행
 */

import { ComponentType } from '../core/Component';
import { Entity } from '../core/Entity';
import { System } from '../core/System';
import { CoreEvents } from '../events';
import { TurnComponent } from '../components/TurnComponent';
import { StatsComponent } from '../components/StatsComponent';

export class TurnSystem extends System<CoreEvents> {
  readonly query: ComponentType[] = [TurnComponent];

  private _round: number = 0;
  private _turnQueue: number[] = [];
  private _currentIndex: number = -1;
  private _cachedEntities: Entity[] = [];

  get currentRound(): number {
    return this._round;
  }

  get turnQueue(): number[] {
    return [...this._turnQueue];
  }

  get currentEntityId(): number | undefined {
    if (this._currentIndex >= 0 && this._currentIndex < this._turnQueue.length) {
      return this._turnQueue[this._currentIndex];
    }
    return undefined;
  }

  get isRoundActive(): boolean {
    return this._currentIndex >= 0 && this._currentIndex < this._turnQueue.length;
  }

  update(entities: Entity[], _delta: number): void {
    this._cachedEntities = entities;
  }

  /**
   * 새로운 라운드를 시작한다.
   * 생존한 모든 엔티티의 이니셔티브/속도를 비교하여 턴 큐를 구성하고 첫 번째 턴을 시작한다.
   */
  startRound(entities?: Entity[]): void {
    const list = entities ?? this._cachedEntities;
    const living = list.filter((e) => {
      const stats = e.get(StatsComponent);
      return !stats || !stats.isDead;
    });

    // 이니셔티브 기준 내림차순 정렬 (높은 순서대로 먼저 행동)
    living.sort((a, b) => {
      const initA = a.get(TurnComponent)?.initiative ?? a.get(StatsComponent)?.speed ?? 0;
      const initB = b.get(TurnComponent)?.initiative ?? b.get(StatsComponent)?.speed ?? 0;
      return initB - initA;
    });

    this._round++;
    this._turnQueue = living.map((e) => e.id);
    this._currentIndex = -1;

    this.bus.emit('turn:round:started', {
      round: this._round,
      turnOrder: this.turnQueue,
    });

    // 첫 번째 턴으로 진행
    this.nextTurn();
  }

  /**
   * 다음 생존 엔티티의 턴으로 전환한다.
   * 라운드의 모든 턴이 종료되면 turn:round:ended 이벤트를 발행한다.
   */
  nextTurn(): number | undefined {
    const prevId = this.currentEntityId;
    if (prevId !== undefined) {
      this.bus.emit('turn:ended', {
        round: this._round,
        entityId: prevId,
      });
    }

    this._currentIndex++;

    // 사망한 엔티티는 건너뛰기
    while (this._currentIndex < this._turnQueue.length) {
      const nextId = this._turnQueue[this._currentIndex];
      const entity = this._cachedEntities.find((e) => e.id === nextId);

      // 엔티티가 존재하고 살아있는 경우 해당 턴 시작
      if (entity) {
        const stats = entity.get(StatsComponent);
        if (!stats || !stats.isDead) {
          const turn = entity.get(TurnComponent);
          if (turn) turn.resetAP();

          this.bus.emit('turn:started', {
            round: this._round,
            entityId: nextId,
            turnIndex: this._currentIndex,
          });
          return nextId;
        }
      }

      this._currentIndex++;
    }

    // 모든 턴 종료 -> 라운드 완료
    this.bus.emit('turn:round:ended', { round: this._round });
    return undefined;
  }

  /**
   * 특정 엔티티의 턴을 종료하고 다음으로 넘긴다.
   * 현재 활성 턴의 엔티티가 아니면 무시된다.
   */
  endTurn(entityId: number): boolean {
    if (this.currentEntityId === entityId) {
      this.nextTurn();
      return true;
    }
    return false;
  }
}
