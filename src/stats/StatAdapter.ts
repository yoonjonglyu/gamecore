/**
 * @module stats/StatAdapter
 * 경량 기본 스탯(StatsComponent)과 고수준 4단계 연산 스탯(ExtendedStatsComponent) 간의
 * 상호 변환 및 동기화를 지원하는 어댑터 유틸리티.
 */

import { StatsComponent, StatsProps } from '../components/StatsComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';

export class StatAdapter {
  /**
   * 경량 StatsComponent를 4단계 연산 파이프라인을 지원하는 ExtendedStatsComponent로 변환합니다.
   */
  static toExtended(stats: StatsComponent): ExtendedStatsComponent {
    return new ExtendedStatsComponent({
      baseStats: {
        maxHp: stats.maxHp,
        maxMp: stats.maxMp,
        attack: stats.attack,
        defense: stats.defense,
        speed: stats.speed,
      },
      currentResources: {
        hp: stats.hp,
        mp: stats.mp,
      },
    });
  }

  /**
   * ExtendedStatsComponent의 최종 계산 결과를 경량 StatsComponent로 추출합니다.
   */
  static toStats(extended: ExtendedStatsComponent): StatsComponent {
    const hasStat = (name: string) => extended.pipeline.hasStat(name);
    return new StatsComponent({
      hp: extended.hp,
      maxHp: extended.maxHp,
      mp: extended.mp,
      maxMp: extended.maxMp,
      attack: hasStat('attack') ? extended.get('attack') : 10,
      defense: hasStat('defense') ? extended.get('defense') : 0,
      speed: hasStat('speed') ? extended.get('speed') : 10,
    });
  }

  /**
   * ExtendedStatsComponent의 최신 계산 수치를 대상 StatsComponent에 복사/동기화합니다.
   */
  static syncToStats(source: ExtendedStatsComponent, target: StatsComponent): void {
    const hasStat = (name: string) => source.pipeline.hasStat(name);
    if (hasStat('maxHp')) target.maxHp = source.get('maxHp');
    if (hasStat('maxMp')) target.maxMp = source.get('maxMp');
    if (hasStat('attack')) target.attack = source.get('attack');
    if (hasStat('defense')) target.defense = source.get('defense');
    if (hasStat('speed')) target.speed = source.get('speed');

    target.hp = source.hp;
    target.mp = source.mp;
  }
}
