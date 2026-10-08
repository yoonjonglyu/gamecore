import { describe, it, expect } from 'vitest';
import { runDungeonCrawlerDemo } from '../examples/dungeon_crawler';

describe('End-to-End Game Integration Demo', () => {
  it('마스터 데이터 주입부터 스폰, 장비 착용, 스킬 공격, 전리품 획득, 레벨업, 세이브/로드까지 완벽히 동작해야 한다', () => {
    const result = runDungeonCrawlerDemo();

    expect(result.heroProg.level).toBeGreaterThanOrEqual(2); // 60 EXP 획득하여 레벨 2 이상 달성
    expect(result.heroInv.getQuantity('gold_coin')).toBe(10); // 금화 10개 획득
    expect(result.newWorld.entities.length).toBeGreaterThanOrEqual(1); // 세이브/로드 복원 성공
  });
});
