import { describe, it, expect, vi } from 'vitest';
import {
  World,
  Entity,
  Component,
  EventBus,
  TurnSystem,
  CombatSystem,
  StatusEffectSystem,
  LootSystem,
  ProgressionSystem,
  ConstraintChecker,
  GridMap,
  GridPathfinder,
  GachaEngine,
  GachaPoolConfig,
  CueQueue,
  ClassComponent,
  ProgressionComponent,
  StatsComponent,
  TurnComponent,
  LootComponent,
  InventoryComponent,
  StatusEffectsComponent,
  SeededRandom,
} from '../src';
import { useComponent } from '../src/react';

// 커스텀 테스트용 컴포넌트
class HeroHpComponent extends Component {
  hp = 100;
  maxHp = 100;
}

describe('Subsystem Bugfixes and Gap Implementations (1.1.3)', () => {
  // 1. React useComponent 훅 갱신 반영
  describe('1. React useComponent', () => {
    it('컴포넌트 내부 값을 변경하고 notifyUpdated를 호출하면 새로운 버전 스냅샷을 감지해야 한다', () => {
      const entity = new Entity(['hero'], 1);
      const heroHp = new HeroHpComponent();
      entity.add(heroHp);

      let versionSeen = -1;
      const unsubscribe = entity.subscribe((_, change) => {
        if (!change.componentType || change.componentType === HeroHpComponent) {
          versionSeen = entity.version;
        }
      });

      // 값 변경 전
      expect(entity.get(HeroHpComponent)?.hp).toBe(100);
      const initialVersion = entity.version;

      // HP 40으로 변경 후 notifyUpdated 호출
      heroHp.hp = 40;
      entity.notifyUpdated(HeroHpComponent);

      expect(entity.version).toBeGreaterThan(initialVersion);
      expect(versionSeen).toBe(entity.version);
      expect(entity.get(HeroHpComponent)?.hp).toBe(40);

      unsubscribe();
    });
  });

  // 2. 연출(Cue) 프로토콜 연동
  describe('2. Cue Protocol Integration', () => {
    it('CombatSystem에서 AttackRequest에 cue가 포함되어 있으면 cue:triggered 이벤트 및 cueQueue에 정상 전달되어야 한다', () => {
      const world = new World();
      const cueQueue = new CueQueue();
      const combatSystem = new CombatSystem({ cueQueue });
      world.addSystem(combatSystem);

      const attacker = world.createEntity('attacker').add(new StatsComponent({ attack: 30 }));
      const target = world.createEntity('target').add(new StatsComponent({ maxHp: 100, hp: 100, defense: 0 }));

      const cueListener = vi.fn();
      world.bus.on('cue:triggered', cueListener);

      combatSystem.requestAttack({
        attackerId: attacker.id,
        targetId: target.id,
        cue: {
          sfx: 'sfx_slash',
          vfx: 'slash_blood',
          shake: 5,
        },
      });

      world.update(16);

      // cue:triggered 이벤트 발생 확인
      expect(cueListener).toHaveBeenCalledTimes(1);
      const eventPayload = cueListener.mock.calls[0][0];
      expect(eventPayload.cue.type).toBe('combat:attack');
      expect(eventPayload.cue.sourceId).toBe(attacker.id);
      expect(eventPayload.cue.targetId).toBe(target.id);
      expect(eventPayload.cue.payload.sfx).toBe('sfx_slash');
      expect(eventPayload.cue.payload.vfx).toBe('slash_blood');

      // CueQueue에도 담겼는지 확인
      expect(cueQueue.length).toBe(1);
      const popped = cueQueue.pop();
      expect(popped?.payload.shake).toBe(5);
    });

    it('StatusEffectSystem에서 반응 규칙의 cueEffect 및 onReaction emitCue가 동작해야 한다', () => {
      const world = new World();
      const cueQueue = new CueQueue();
      const statusSystem = new StatusEffectSystem();
      statusSystem.setCueQueue(cueQueue);
      world.addSystem(statusSystem);

      let customCueEmitted = false;
      statusSystem.registerReaction({
        name: 'vaporize',
        statuses: ['wet', 'fire'],
        cueEffect: 'vfx_steam_burst',
        onReaction: (_entity, _a, _b, ctx) => {
          ctx.emitCue?.('vfx_custom_flare');
          customCueEmitted = true;
        },
      });

      const entity = world.createEntity('hero').add(new StatusEffectsComponent());
      statusSystem.applyStatus(entity, 'wet', 10);
      statusSystem.applyStatus(entity, 'fire', 10);

      expect(customCueEmitted).toBe(true);
      // rule.cueEffect 1개 + onReaction emitCue 1개 = 2개
      expect(cueQueue.length).toBe(2);
      const cues = cueQueue.flush();
      expect(cues[0].payload.vfx).toBe('vfx_steam_burst');
      expect(cues[1].payload.vfx).toBe('vfx_custom_flare');
    });
  });

  // 3. A* 길찾기 한도 초과 여부 (maxStepsExceeded)
  describe('3. GridPathfinder Step Limit Signal', () => {
    it('maxSteps에 도달하여 경로 탐색이 중단된 경우 maxStepsExceeded: true를 반환해야 한다', () => {
      const map = new GridMap(20, 20);
      // 좁은 스텝 제한 5로 설정
      const result = GridPathfinder.findPath(
        map,
        { x: 0, y: 0 },
        { x: 19, y: 19 },
        { maxSteps: 5 }
      );

      expect(result.found).toBe(false);
      expect(result.visitedCount).toBe(5);
      expect(result.maxStepsExceeded).toBe(true);
    });

    it('목표점이 벽에 둘러싸여 경로가 없는 경우 maxStepsExceeded는 false여야 한다', () => {
      const map = new GridMap(5, 5);
      // 목표점 (4, 4) 주변을 벽으로 막음
      map.setTile(3, 4, { type: 'wall', walkable: false });
      map.setTile(4, 3, { type: 'wall', walkable: false });

      const result = GridPathfinder.findPath(
        map,
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { maxSteps: 100 }
      );

      expect(result.found).toBe(false);
      expect(result.maxStepsExceeded).toBe(false);
    });
  });

  // 4. 가챠 천장 0 처리 (비활성화)
  describe('4. GachaEngine hardPityCount: 0', () => {
    it('hardPityCount: 0 또는 미설정 시 천장이 비활성화되어 항상 최고 등급이 나오는 버그가 없어야 한다', () => {
      const zeroPityPool: GachaPoolConfig = {
        id: 'no_pity',
        hardPityCount: 0, // 0 = 천장 비활성화 의도
        tiers: [
          { tier: 'SSR', baseRate: 0.0, items: ['ssr_1'] }, // 0% 확률
          { tier: 'R', baseRate: 1.0, items: ['r_1'] },
        ],
      };

      const gacha = new GachaEngine([zeroPityPool], new SeededRandom(1234));
      // 5회 뽑기 모두 0% SSR이 아닌 R이어야 함
      for (let i = 0; i < 5; i++) {
        const res = gacha.pull('no_pity');
        expect(res.tier).toBe('R');
      }
    });
  });

  // 5. 미등록 custom 제약 fail-closed
  describe('5. ConstraintChecker Custom Constraint Fail-Closed', () => {
    it('등록되지 않은 커스텀 핸들러 ID를 사용할 경우 fail-closed로 거부되어야 한다', () => {
      const checker = new ConstraintChecker();
      const entity = new Entity(['player'], 1);

      const result = checker.check(entity, [
        {
          type: 'custom',
          id: 'typo_unregistered_handler_id',
        },
      ]);

      expect(result.ok).toBe(false);
      expect(result.reason).toContain('미등록 커스텀 제약 핸들러');
    });
  });

  // 6. EventBus 리스너 예외 격리
  describe('6. EventBus Exception Isolation', () => {
    it('하나의 리스너가 예외를 던져도 나머지 리스너는 정상 실행되어야 한다', () => {
      const bus = new EventBus<{ 'test:event': { value: number } }>();

      const listener1 = vi.fn();
      const listener2 = vi.fn(() => {
        throw new Error('Listener 2 Exploded!');
      });
      const listener3 = vi.fn();

      bus.on('test:event', listener1);
      bus.on('test:event', listener2);
      bus.on('test:event', listener3);

      // emit 시 에러가 외부로 전파되어 전체가 죽지 않고 격리됨
      expect(() => {
        bus.emit('test:event', { value: 42 });
      }).not.toThrow();

      expect(listener1).toHaveBeenCalledWith({ value: 42 });
      expect(listener2).toHaveBeenCalledWith({ value: 42 });
      expect(listener3).toHaveBeenCalledWith({ value: 42 });
    });
  });

  // 7. TurnSystem.startRound 인자 즉시 캐싱
  describe('7. TurnSystem startRound caching', () => {
    it('update() 호출 전이라도 startRound(entities)에 넘긴 엔티티가 즉시 반영되어 currentEntityId가 설정되어야 한다', () => {
      const world = new World();
      const turnSystem = new TurnSystem();
      world.addSystem(turnSystem);

      const e1 = world.createEntity('hero')
        .add(new TurnComponent({ initiative: 100 }))
        .add(new StatsComponent());
      const e2 = world.createEntity('goblin')
        .add(new TurnComponent({ initiative: 50 }))
        .add(new StatsComponent());

      // update() 호출 없이 바로 startRound([e1, e2]) 호출
      turnSystem.startRound([e1, e2]);

      expect(turnSystem.currentRound).toBe(1);
      expect(turnSystem.currentEntityId).toBe(e1.id);
      expect(turnSystem.isRoundActive).toBe(true);
    });
  });

  // 8. 레벨 제약 ProgressionComponent 지원
  describe('8. ConstraintChecker Level with ProgressionComponent', () => {
    it('ClassComponent 없이 ProgressionComponent만 있는 엔티티도 레벨 제약을 통과할 수 있어야 한다', () => {
      const checker = new ConstraintChecker();
      const entity = new Entity(['player'], 1).add(
        new ProgressionComponent({ level: 20 })
      );

      const result = checker.check(entity, [
        {
          type: 'level',
          min: 15,
        },
      ]);

      expect(result.ok).toBe(true);

      const failResult = checker.check(entity, [
        {
          type: 'level',
          min: 25,
        },
      ]);

      expect(failResult.ok).toBe(false);
      expect(failResult.reason).toContain('레벨 부족');
    });
  });

  // 9. LootSystem 자동 연결 (stats:died -> processLoot)
  describe('9. LootSystem Automatic stats:died integration', () => {
    it('CombatSystem에서 적 처치 시 killerId가 포함된 stats:died를 통해 LootSystem에 자동 등록되어야 한다', () => {
      const world = new World();
      const progSystem = new ProgressionSystem();
      const lootSystem = new LootSystem(progSystem);
      const combatSystem = new CombatSystem();

      world.addSystem(progSystem);
      world.addSystem(lootSystem);
      world.addSystem(combatSystem);

      const killer = world.createEntity('killer')
        .add(new InventoryComponent())
        .add(new StatsComponent({ attack: 100 }))
        .add(new ProgressionComponent({ level: 1, expFormula: () => 500 }));

      const monster = world.createEntity('monster')
        .add(new StatsComponent({ maxHp: 50, hp: 50 }))
        .add(
          new LootComponent({
            exp: 150,
            items: [{ itemId: 'rare_sword', chance: 1.0, min: 1, max: 1 }],
          })
        );

      let diedEvent: any = null;
      world.bus.on('stats:died', (e) => { diedEvent = e; });
      let lootEvent: any = null;
      world.bus.on('loot:dropped', (e) => { lootEvent = e; });

      // 공격 요청 (50HP 몬스터를 100 공격력으로 일격 처치)
      combatSystem.requestAttack({
        attackerId: killer.id,
        targetId: monster.id,
      });

      world.update(16);
      world.update(16);

      const killerInv = killer.get(InventoryComponent)!;
      const killerProg = killer.get(ProgressionComponent)!;

      expect(killerInv.getQuantity('rare_sword')).toBe(1);
      expect(killerProg.currentExp).toBe(150);
    });
  });
});
