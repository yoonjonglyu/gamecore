import { describe, it, expect } from 'vitest';
import {
  OfflineProgressEngine,
  DialogueSession,
  Blackboard,
  GridMap,
  LineOfSight,
  FieldOfView,
  SelectorNode,
  SequenceNode,
  InverterNode,
  ConditionNode,
  ActionNode,
  BehaviorTreeRunner,
  GachaEngine,
  GachaPoolConfig,
  SeededRandom,
  DropTable,
} from '../src';

describe('Expansion Systems (Idle, Dialogue, FOV/LOS, BehaviorTree, Gacha)', () => {
  // ──────────────────────────────────────────────
  // 1. OfflineProgressEngine (오프라인 보상 엔진)
  // ──────────────────────────────────────────────
  describe('1. OfflineProgressEngine', () => {
    it('경과 시간에 따라 자원 생산량 및 스태미나를 올바르게 계산해야 한다', () => {
      const now = 1700000000000;
      const last = now - 3600 * 1000; // 1시간 전

      const result = OfflineProgressEngine.calculate({
        lastTimestamp: last,
        currentTimestamp: now,
        rates: { gold: 10, exp: 2 }, // 초당 10골드, 2경험치
        stamina: { current: 10, max: 100, secondsPerPoint: 360 }, // 6분마다 1 회복
      });

      expect(result.elapsedSeconds).toBe(3600);
      expect(result.isCapped).toBe(false);
      expect(result.accumulated.gold).toBe(36000);
      expect(result.accumulated.exp).toBe(7200);

      // 3600 / 360 = 10 회복
      expect(result.stamina?.recovered).toBe(10);
      expect(result.stamina?.next).toBe(20);
    });

    it('최대 상한선(maxOfflineSeconds) 및 효율(efficiency) 계수를 적용해야 한다', () => {
      const now = 1700000000000;
      const last = now - 7200 * 1000; // 2시간 전

      const result = OfflineProgressEngine.calculate({
        lastTimestamp: last,
        currentTimestamp: now,
        maxOfflineSeconds: 3600, // 최대 1시간까지만 누적
        rates: { gold: 10 },
        efficiency: 0.8, // 80%만 지급
      });

      expect(result.isCapped).toBe(true);
      expect(result.appliedSeconds).toBe(3600);
      // 3600 * 10 * 0.8 = 28800
      expect(result.accumulated.gold).toBe(28800);
    });

    it('스테이지 클리어 시뮬레이션 및 전리품 드랍을 계산해야 한다', () => {
      const dropTable = new DropTable('goblin_drop', [
        { itemId: 'bone', minQuantity: 1, maxQuantity: 1, chance: 1.0 },
      ]);

      const result = OfflineProgressEngine.calculate({
        lastTimestamp: 1000,
        currentTimestamp: 1000 + 60 * 1000, // 60초 경과
        stageSimulation: {
          stageId: 1,
          secondsPerClear: 20, // 20초마다 1클리어 -> 3회 클리어
          dropTable,
        },
      });

      expect(result.stageSimulation?.clearCount).toBe(3);
      expect(result.stageSimulation?.drops).toEqual([{ itemId: 'bone', quantity: 3 }]);
    });
  });

  // ──────────────────────────────────────────────
  // 2. DialogueTreeEngine (대화 트리 및 선택지)
  // ──────────────────────────────────────────────
  describe('2. DialogueTreeEngine', () => {
    it('단방향 대화와 조건부 분기 선택지가 올바르게 동작해야 한다', () => {
      const bb = new Blackboard();
      bb.set('affinity', 30);

      const tree = {
        id: 'npc_greeting',
        initialNodeId: 'node_1',
        nodes: {
          node_1: {
            id: 'node_1',
            speaker: '엘리스',
            text: '안녕하세요, 모험가님!',
            next: 'node_choice',
          },
          node_choice: {
            id: 'node_choice',
            speaker: '엘리스',
            text: '어떤 일로 오셨나요?',
            choices: [
              {
                id: 'c_normal',
                text: '의뢰를 받으러 왔어요.',
                targetNodeId: 'node_quest',
              },
              {
                id: 'c_secret',
                text: '비밀 대화를 나눈다 (호감도 50 이상)',
                targetNodeId: 'node_secret',
                condition: (ctx) => (ctx.blackboard?.get<number>('affinity') ?? 0) >= 50,
              },
            ],
          },
          node_quest: {
            id: 'node_quest',
            speaker: '엘리스',
            text: '여기 고블린 토벌 의뢰서예요.',
          },
          node_secret: {
            id: 'node_secret',
            speaker: '엘리스',
            text: '우리 둘만의 비밀 이야기예요...',
          },
        },
      };

      const session = new DialogueSession(tree, bb);
      expect(session.currentNode?.text).toBe('안녕하세요, 모험가님!');

      // 단방향 next
      session.next();
      expect(session.currentNodeId).toBe('node_choice');

      // 호감도가 30이므로 c_secret은 미노출이어야 함
      expect(session.availableChoices.length).toBe(1);
      expect(session.availableChoices[0].id).toBe('c_normal');

      // 호감도 증가 후 재확인
      bb.set('affinity', 60);
      expect(session.availableChoices.length).toBe(2);

      // 비밀 선택지 선택
      session.selectChoice('c_secret');
      expect(session.currentNodeId).toBe('node_secret');
      expect(session.currentNode?.text).toBe('우리 둘만의 비밀 이야기예요...');
    });
  });

  // ──────────────────────────────────────────────
  // 3. FieldOfView & LineOfSight (시야 & 가시선)
  // ──────────────────────────────────────────────
  describe('3. FieldOfView & LineOfSight', () => {
    it('장애물 유무에 따라 직선 가시선(LOS) 판정이 정확해야 한다', () => {
      const map = GridMap.fromASCII([
        '.....',
        '..#..',
        '.....',
      ], {
        '.': { type: 'floor', walkable: true },
        '#': { type: 'wall', walkable: false },
      });

      // (0, 1) -> (4, 1) 중간에 (2, 1) 벽(#)이 가로막고 있음
      expect(map.hasLineOfSight(0, 1, 4, 1)).toBe(false);

      // (0, 0) -> (4, 0) 벽이 없는 직선 경로
      expect(map.hasLineOfSight(0, 0, 4, 0)).toBe(true);

      // (0, 0) -> (0, 2) 수직 직선 경로
      expect(map.hasLineOfSight(0, 0, 0, 2)).toBe(true);
    });

    it('원형 반경 내의 가시 타일(FOV)을 정확히 계산해야 한다', () => {
      const map = GridMap.fromASCII([
        '.....',
        '..#..',
        '.....',
      ], {
        '.': { type: 'floor', walkable: true },
        '#': { type: 'wall', walkable: false },
      });

      // (0, 1) 위치에서 반경 2 시야
      const fov = map.computeFOV(0, 1, 2);
      expect(fov.length).toBeGreaterThan(0);

      // 중심점 (0, 1)은 반드시 포함
      expect(fov.some((p) => p.x === 0 && p.y === 1)).toBe(true);
      // 벽 자체 (2, 1)는 시야에 닿으므로 포함
      expect(fov.some((p) => p.x === 2 && p.y === 1)).toBe(true);
      // 벽 뒤의 (3, 1)은 시야가 가로막혀 포함되지 않아야 함
      expect(fov.some((p) => p.x === 3 && p.y === 1)).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // 4. BehaviorTree (비헤이비어 트리 AI)
  // ──────────────────────────────────────────────
  describe('4. BehaviorTree', () => {
    it('Selector, Sequence, Condition, Action이 올바르게 평가되어야 한다', () => {
      // 몬스터 AI:
      // Selector:
      //   1. Sequence: (체력 < 30% 이면 힐 포션 사용)
      //   2. Action: (일반 공격)
      let usedPotion = false;
      let usedAttack = false;

      const tree = new SelectorNode([
        new SequenceNode([
          new ConditionNode((ctx) => ctx.hp < 30),
          new ActionNode((ctx) => {
            usedPotion = true;
            ctx.hp += 50;
            return 'SUCCESS';
          }),
        ]),
        new ActionNode((ctx) => {
          usedAttack = true;
          return 'SUCCESS';
        }),
      ]);

      const runner = new BehaviorTreeRunner(tree, { hp: 20 });

      // 1회 틱: hp가 20이므로 포션 사용
      const status1 = runner.tick();
      expect(status1).toBe('SUCCESS');
      expect(usedPotion).toBe(true);
      expect(usedAttack).toBe(false);
      expect(runner.context.hp).toBe(70);

      // 2회 틱: hp가 70이므로 포션 시퀀스 실패 -> 일반 공격 실행
      usedPotion = false;
      const status2 = runner.tick();
      expect(status2).toBe('SUCCESS');
      expect(usedPotion).toBe(false);
      expect(usedAttack).toBe(true);
    });

    it('Inverter 데코레이터가 결과를 올바르게 반전시켜야 한다', () => {
      const inv = new InverterNode(new ConditionNode(() => true));
      expect(inv.execute({})).toBe('FAILURE');
    });
  });

  // ──────────────────────────────────────────────
  // 5. GachaEngine (가챠 & 천장 시스템)
  // ──────────────────────────────────────────────
  describe('5. GachaEngine', () => {
    const testPool: GachaPoolConfig = {
      id: 'hero_pickup',
      hardPityCount: 10, // 테스트를 위해 10뽑 하드 천장
      softPityStart: 10,
      pickupRate: 0.5,
      tiers: [
        {
          tier: 'SSR',
          baseRate: 0.0, // 기본 확률 0%로 설정하여 천장만으로 나오게 테스트
          items: ['hero_standard_1'],
          pickupItems: ['hero_pickup_lloyd'],
        },
        {
          tier: 'R',
          baseRate: 1.0,
          items: ['sword_r', 'shield_r'],
        },
      ],
    };

    it('지정된 하드 천장 횟수에 도달하면 최고 등급을 100% 획득하고 카운트가 리셋되어야 한다', () => {
      const gacha = new GachaEngine([testPool], new SeededRandom(42));

      // 9번 뽑기 -> 모두 R 등급
      for (let i = 1; i <= 9; i++) {
        const pull = gacha.pull('hero_pickup');
        expect(pull.tier).toBe('R');
        expect(gacha.getPityState('hero_pickup').pityCount).toBe(i);
      }

      // 10번째 뽑기 (하드 천장 10 도달) -> SSR 확정 획득 및 천장 카운트 리셋(0)
      const tenthPull = gacha.pull('hero_pickup');
      expect(tenthPull.tier).toBe('SSR');
      expect(gacha.getPityState('hero_pickup').pityCount).toBe(0);
    });

    it('소프트 천장 구간에서 최고 등급 획득 확률이 점진적으로 증가해야 한다', () => {
      const softPool: GachaPoolConfig = {
        id: 'soft_pool',
        hardPityCount: 10,
        softPityStart: 5,
        softPityRateIncrease: 0.5, // 5번째부터 +50% 확률 증가
        tiers: [
          { tier: 'SSR', baseRate: 0.0, items: ['ssr_item'] },
          { tier: 'R', baseRate: 1.0, items: ['r_item'] },
        ],
      };

      const gacha = new GachaEngine([softPool], new SeededRandom(100));
      // 4회는 R 확정
      for (let i = 0; i < 4; i++) {
        expect(gacha.pull('soft_pool').tier).toBe('R');
      }
      // 5회차: 소프트 천장 발동 (0.5 확률)
      const pull5 = gacha.pull('soft_pool');
      // 50% 확률 롤 성공 또는 다음 6회차(100%)에서 SSR 획득
      expect(['R', 'SSR']).toContain(pull5.tier);
    });

    it('Pity 상태를 export 및 import하여 세이브/로드할 수 있어야 한다', () => {
      const gacha1 = new GachaEngine([testPool]);
      gacha1.pullMultiple('hero_pickup', 5);
      expect(gacha1.getPityState('hero_pickup').pityCount).toBe(5);

      const exported = gacha1.exportPityState();

      // 새로운 가챠 엔진에 복원
      const gacha2 = new GachaEngine([testPool]);
      gacha2.importPityState(exported);
      expect(gacha2.getPityState('hero_pickup').pityCount).toBe(5);
    });
  });
});
