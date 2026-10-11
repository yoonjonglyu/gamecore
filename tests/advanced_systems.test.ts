import { describe, it, expect, beforeEach } from 'vitest';
import {
  GridMap,
  GridPathfinder,
  InventoryComponent,
  World,
  Entity,
  StatusEffectSystem,
  StatsComponent,
  ReplayRecorder,
  ReplayPlayer,
  SeededRandom,
} from '../src';

describe('Advanced Systems (v1.1 Features: 2, 3, 4, 5)', () => {
  // ──────────────────────────────────────────────
  // 2번: GridPathfinding (A* 알고리즘)
  // ──────────────────────────────────────────────
  describe('2. GridPathfinding (A* Pathfinding)', () => {
    it('장애물이 있는 맵에서 시작점부터 목표점까지의 최단 경로를 탐색해야 한다', () => {
      const ascii = [
        '.....',
        '.###.',
        '.....',
      ];
      const map = GridMap.fromASCII(ascii, {
        '.': { type: 'floor', walkable: true },
        '#': { type: 'wall', walkable: false },
      });

      // (0, 1)에서 (4, 1)까지 벽을 우회하여 이동
      const result = map.findPath({ x: 0, y: 1 }, { x: 4, y: 1 });

      expect(result.found).toBe(true);
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.path[0]).toEqual({ x: 0, y: 1 });
      expect(result.path[result.path.length - 1]).toEqual({ x: 4, y: 1 });

      // 경로 상에 벽(#) 좌표가 포함되어 있지 않아야 함
      for (const pt of result.path) {
        expect(map.isWalkable(pt.x, pt.y)).toBe(true);
      }
    });

    it('도달할 수 없는 막힌 목표점은 found: false를 반환해야 한다', () => {
      const ascii = [
        '###',
        '#.#',
        '###',
      ];
      const map = GridMap.fromASCII(ascii, {
        '.': { type: 'floor', walkable: true },
        '#': { type: 'wall', walkable: false },
      });

      const result = map.findPath({ x: 1, y: 1 }, { x: 0, y: 0 });
      expect(result.found).toBe(false);
      expect(result.path).toEqual([]);
    });

    it('동적 장애물(extraObstacles)을 우회할 수 있어야 한다', () => {
      const map = new GridMap(5, 5);
      // (1, 0)에 동적 유닛이 위치
      const obstacles = [{ x: 1, y: 0 }];

      const result = map.findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, {
        extraObstacles: obstacles,
      });

      expect(result.found).toBe(true);
      // (1, 0)을 지나지 않고 y를 우회해야 함
      const hasObstacle = result.path.some((p) => p.x === 1 && p.y === 0);
      expect(hasObstacle).toBe(false);
    });

    it('대각선 이동을 허용하면 유클리드/체비쇼프 최단 거리 경로를 생성해야 한다', () => {
      const map = new GridMap(5, 5);
      const diagResult = map.findPath({ x: 0, y: 0 }, { x: 3, y: 3 }, {
        allowDiagonal: true,
      });

      expect(diagResult.found).toBe(true);
      // 대각선 3스텝 (0,0 -> 1,1 -> 2,2 -> 3,3)
      expect(diagResult.path.length).toBe(4);
    });
  });

  // ──────────────────────────────────────────────
  // 3번: 인벤토리 고도화 (스택 분할, 자동 병합, 정렬, 무게)
  // ──────────────────────────────────────────────
  describe('3. Advanced Inventory (AutoStack, Sort, Weight, Transfer)', () => {
    const itemDefs = {
      potion: { id: 'potion', name: '물약', rarity: 1, weight: 0.5, maxStack: 5, value: 50 },
      sword: { id: 'sword', name: '강철 검', rarity: 3, weight: 5.0, maxStack: 1, value: 300 },
      gem: { id: 'gem', name: '루비 보석', rarity: 5, weight: 0.1, maxStack: 10, value: 1000 },
    };
    const lookup = (id: string | number) => (itemDefs as any)[id];

    it('maxStack 설정 시 수량이 초과되면 슬롯이 분할되어야 하고, autoStack으로 병합되어야 한다', () => {
      const inv = new InventoryComponent(10);

      // maxStack: 5인 물약을 12개 추가 -> 5개, 5개, 2개로 3개 슬롯 필요
      inv.add('potion', 12, { maxStack: 5, metaLookup: lookup });
      expect(inv.size).toBe(3);
      expect(inv.getQuantity('potion')).toBe(12);

      // 1개 소비
      inv.remove('potion', 1);
      expect(inv.getQuantity('potion')).toBe(11);

      // 쪼개진 슬롯을 autoStack으로 압축
      inv.autoStack(lookup);
      expect(inv.getQuantity('potion')).toBe(11);
      // 5개, 5개, 1개 (총 3슬롯)
      expect(inv.size).toBe(3);
    });

    it('무게 제한(maxWeight)을 초과하는 아이템 추가는 거절되어야 한다', () => {
      const inv = new InventoryComponent({ maxSlots: 10, maxWeight: 8 });

      // sword(무게 5) 1개 추가 성공
      expect(inv.add('sword', 1, { metaLookup: lookup })).toBe(true);
      expect(inv.getCurrentWeight(lookup)).toBe(5);

      // sword 1개 더 추가 시 총 무게 10 > 8 이므로 거절
      expect(inv.add('sword', 1, { metaLookup: lookup })).toBe(false);
      expect(inv.getCurrentWeight(lookup)).toBe(5);
    });

    it('희귀도, 이름, 수량 기준으로 정렬(sortBy)할 수 있어야 한다', () => {
      const inv = new InventoryComponent(10);
      inv.add('sword', 1, { metaLookup: lookup });
      inv.add('potion', 5, { metaLookup: lookup });
      inv.add('gem', 2, { metaLookup: lookup });

      // 희귀도 내림차순 정렬 (gem: 5 > sword: 3 > potion: 1)
      inv.sortBy('rarity', 'desc', lookup);
      expect(inv.items[0].defId).toBe('gem');
      expect(inv.items[1].defId).toBe('sword');
      expect(inv.items[2].defId).toBe('potion');

      // 수량 오름차순 정렬 (sword: 1 < gem: 2 < potion: 5)
      inv.sortBy('quantity', 'asc', lookup);
      expect(inv.items[0].defId).toBe('sword');
      expect(inv.items[1].defId).toBe('gem');
      expect(inv.items[2].defId).toBe('potion');
    });

    it('인벤토리 간 아이템 전송(transferTo)이 정상 동작해야 한다', () => {
      const source = new InventoryComponent(10);
      const target = new InventoryComponent(10);

      source.add('potion', 10);
      const res = source.transferTo(target, 'potion', 4);

      expect(res.transferred).toBe(4);
      expect(source.getQuantity('potion')).toBe(6);
      expect(target.getQuantity('potion')).toBe(4);
    });
  });

  // ──────────────────────────────────────────────
  // 4번: 상태이상 다중 중첩 decay & 원소/상태 상호작용
  // ──────────────────────────────────────────────
  describe('4. Status Effects Decay & Elemental Reactions', () => {
    let world: World;
    let statusSys: StatusEffectSystem;
    let target: Entity;

    beforeEach(() => {
      world = new World();
      statusSys = new StatusEffectSystem();
      world.addSystem(statusSys);

      target = world.createEntity();
      target.add(new StatsComponent({ hp: 100, maxHp: 100 }));
    });

    it('stackBehavior가 decay일 때 지속시간 만료 시 1스택씩 감소하고 잔여 지속시간이 리셋되어야 한다', () => {
      let decayedCount = 0;
      world.bus.on('status:stack:decayed', () => {
        decayedCount++;
      });

      // 3스택 부여, decay 모드 (duration: 1000ms)
      statusSys.applyStatus(target, 'poison', 1000, 0, 3, 3, {
        stackBehavior: 'decay',
      });

      // 1000ms 경과 -> 3스택에서 2스택으로 감소
      world.update(1000);
      expect(decayedCount).toBe(1);
      const comp = target.get(statusSys.query[0] as any);
      expect(comp.get('poison')?.stacks).toBe(2);

      // 다시 1000ms 경과 -> 2스택에서 1스택으로 감소
      world.update(1000);
      expect(decayedCount).toBe(2);
      expect(comp.get('poison')?.stacks).toBe(1);

      // 마지막 1000ms 경과 -> 완전 만료 및 제거
      world.update(1000);
      expect(comp.has('poison')).toBe(false);
    });

    it('원소 반응 규칙이 등록되어 있을 때 두 상태이상이 만나면 보너스 데미지와 반응이 격발되어야 한다', () => {
      let reactionTriggered = false;

      // 화염 + 기름 = 대폭발 (보너스 피해 30, 둘 다 소모)
      statusSys.registerReaction({
        name: 'combustion',
        statuses: ['fire', 'oil'],
        bonusDamage: 30,
        consume: 'both',
        onReaction: () => {
          reactionTriggered = true;
        },
      });

      // 1. 타겟에게 먼저 'oil' 부여
      statusSys.applyStatus(target, 'oil', 5000, 0);

      // 2. 타겟에게 'fire' 부여 시 combustion 반응 발동!
      statusSys.applyStatus(target, 'fire', 5000, 0);

      expect(reactionTriggered).toBe(true);
      const stats = target.get(StatsComponent)!;
      // 100 - 30 = 70
      expect(stats.hp).toBe(70);

      // consume: 'both'에 의해 oil과 fire 둘 다 제거됨
      const comp = target.get(statusSys.query[0] as any);
      expect(comp.has('oil')).toBe(false);
      expect(comp.has('fire')).toBe(false);
    });

    it('상태 결합 시 새로운 상태이상으로 전환(resultStatus)되어야 한다', () => {
      // 젖음(wet) + 동결(frost) => 빙결(frozen) 상태이상 부여
      statusSys.registerReaction({
        name: 'freeze',
        statuses: ['wet', 'frost'],
        consume: 'both',
        resultStatus: {
          id: 'frozen',
          duration: 3000,
        },
      });

      statusSys.applyStatus(target, 'wet', 5000, 0);
      statusSys.applyStatus(target, 'frost', 5000, 0);

      const comp = target.get(statusSys.query[0] as any);
      expect(comp.has('wet')).toBe(false);
      expect(comp.has('frost')).toBe(false);
      expect(comp.has('frozen')).toBe(true);
      expect(comp.get('frozen')?.remainingDuration).toBe(3000);
    });
  });

  // ──────────────────────────────────────────────
  // 5번: 결정론적 리플레이 녹화 & 재생기
  // ──────────────────────────────────────────────
  describe('5. Deterministic Replay (Recorder & Player)', () => {
    it('액션과 체크포인트를 녹화하고, 플레이어로 재생 시 완벽히 일치해야 한다', () => {
      const seed = 12345;
      const recorder = new ReplayRecorder(seed);

      // 가상 시뮬레이션: 0틱에 스킬 사용, 2틱에 이동, 5틱에 체크포인트
      recorder.recordAction(0, 'cast_skill', { skillId: 'fireball', targetId: 2 });
      recorder.recordAction(2, 'move', { x: 10, y: 20 });
      recorder.recordCheckpoint(5, 'hp_75_gold_100');

      const replayData = recorder.toData();

      // 재생기 검증
      const player = new ReplayPlayer(replayData);
      const executed: string[] = [];

      const result = player.playToEnd(
        (tick) => {
          // 월드 틱 진행 콜백
        },
        (action) => {
          executed.push(`${action.tick}:${action.actionType}`);
        },
        () => {
          // 월드 체크포인트 해시 계산 콜백
          return 'hp_75_gold_100';
        },
      );

      expect(result.completed).toBe(true);
      expect(result.desynced).toBe(false);
      expect(result.totalActionsExecuted).toBe(2);
      expect(executed).toEqual(['0:cast_skill', '2:move']);
    });

    it('재생 중 상태 해시가 불일치하면 desynced: true를 감지해야 한다', () => {
      const recorder = new ReplayRecorder('seed-1');
      recorder.recordAction(1, 'attack');
      recorder.recordCheckpoint(1, 'expected_checksum_A');

      const player = new ReplayPlayer(recorder.toJSON());

      const result = player.playToEnd(
        () => {},
        () => {},
        () => 'tampered_checksum_B', // 변조되거나 달라진 상태
      );

      expect(result.desynced).toBe(true);
      expect(result.desyncTick).toBe(1);
    });

    it('SeededRandom과 연동하여 리플레이 시 동일한 난수 시퀀스를 보장해야 한다', () => {
      const seed = 'deterministic-combat-seed';
      const rng1 = new SeededRandom(seed);
      const recorder = new ReplayRecorder(seed);

      // 녹화 세션: 3번 굴린 주사위 값 기록
      const rolls1: number[] = [];
      for (let i = 0; i < 3; i++) {
        const val = rng1.nextInt(1, 100);
        rolls1.push(val);
        recorder.recordAction(i, 'roll', { val });
      }

      // 재생 세션: 리플레이 시드로 RNG 초기화 후 동일 시퀀스 확인
      const player = new ReplayPlayer(recorder.toData());
      const rng2 = new SeededRandom(player.data.seed);
      const rolls2: number[] = [];

      player.playToEnd(
        () => {},
        (action) => {
          const val = rng2.nextInt(1, 100);
          rolls2.push(val);
          expect(val).toBe(action.payload.val);
        },
      );

      expect(rolls1).toEqual(rolls2);
    });
  });
});
