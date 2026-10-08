import { describe, it, expect, vi } from 'vitest';
import {
  World,
  DataManager,
  EntityFactory,
  Registry,
  ItemDef,
  SkillDef,
  EntityBlueprint,
  IdentityComponent,
  StatsComponent,
  SkillsComponent,
  InventoryComponent,
  EquipmentComponent,
  ItemDefComponent,
  Component,
} from '../src';

describe('Data Management & EntityFactory', () => {
  // ─── 1. Registry 단위 테스트 ──────────────────────────────────────────────
  describe('Registry', () => {
    it('항목을 등록하고 ID로 조회할 수 있어야 한다', () => {
      const reg = new Registry<{ id: string; name: string }>();
      reg.register({ id: 'item_1', name: '단검' });

      expect(reg.size).toBe(1);
      expect(reg.has('item_1')).toBe(true);
      expect(reg.get('item_1')?.name).toBe('단검');
      expect(reg.get('non_existent')).toBeUndefined();
    });

    it('getOrThrow 호출 시 없는 ID면 예외를 던져야 한다', () => {
      const reg = new Registry<{ id: string }>();
      expect(() => reg.getOrThrow('invalid')).toThrowError(/Entry with ID 'invalid' not found/);
    });

    it('filter 및 find가 정상 동작해야 한다', () => {
      const reg = new Registry<{ id: number; level: number }>([
        { id: 1, level: 5 },
        { id: 2, level: 10 },
        { id: 3, level: 15 },
      ]);

      expect(reg.filter((e) => e.level >= 10)).toHaveLength(2);
      expect(reg.find((e) => e.level === 10)?.id).toBe(2);
    });

    it('remove와 clear가 정상 동작해야 한다', () => {
      const reg = new Registry<{ id: string }>([{ id: 'a' }, { id: 'b' }]);
      expect(reg.remove('a')).toBe(true);
      expect(reg.size).toBe(1);
      reg.clear();
      expect(reg.size).toBe(0);
    });
  });

  // ─── 2. DataManager 번들 로드 테스트 ─────────────────────────────────────
  describe('DataManager', () => {
    it('아이템, 스킬, 블루프린트 번들을 일괄 로드할 수 있어야 한다', () => {
      const data = new DataManager({
        items: [
          { id: 'potion_hp', name: 'HP 물약', category: 'consumable', value: 50 },
        ],
        skills: [
          {
            id: 'slash',
            name: '베기',
            mpCost: 5,
            cooldown: 1000,
            targetType: 'single_enemy',
            effects: [{ type: 'damage', basePower: 20 }],
          },
        ],
        blueprints: [
          {
            id: 'slime',
            tags: ['enemy'],
            identity: { name: '슬라임' },
            stats: { maxHp: 30, attack: 5 },
          },
        ],
      });

      expect(data.items.has('potion_hp')).toBe(true);
      expect(data.skills.has('slash')).toBe(true);
      expect(data.blueprints.has('slime')).toBe(true);
    });

    it('커스텀 레지스트리를 동적으로 생성하고 사용할 수 있어야 한다', () => {
      const data = new DataManager();
      const cardRegistry = data.getOrCreateRegistry<{ id: string; cost: number }>('cards');

      cardRegistry.register({ id: 'strike', cost: 1 });
      expect(data.hasRegistry('cards')).toBe(true);
      expect(data.getRegistry('cards')?.get('strike')?.cost).toBe(1);
    });
  });

  // ─── 3. EntityFactory 스폰 & 조립 테스트 ──────────────────────────────────
  describe('EntityFactory', () => {
    function setupFactory() {
      const world = new World();
      const data = new DataManager();

      // 스킬 마스터 데이터
      const fireball: SkillDef = {
        id: 'fireball',
        name: '화염구',
        mpCost: 15,
        cooldown: 2000,
        targetType: 'single_enemy',
        effects: [{ type: 'damage', basePower: 50 }],
      };
      data.skills.register(fireball);

      // 아이템 마스터 데이터
      const potion: ItemDef = {
        id: 'potion_hp',
        name: '체력 포션',
        category: 'consumable',
        value: 30,
      };
      const sword: ItemDef = {
        id: 'iron_sword',
        name: '철검',
        category: 'weapon',
        spec: { weaponType: 'sword' },
      };
      data.items.registerMany([potion, sword]);

      // 블루프린트 등록
      const goblinBlueprint: EntityBlueprint = {
        id: 'goblin_warrior',
        tags: ['enemy', 'humanoid'],
        identity: {
          idx: 201,
          name: '고블린 전사',
          description: '성질이 사나운 고블린',
        },
        stats: {
          maxHp: 60,
          attack: 12,
          defense: 4,
          speed: 6,
        },
        skills: ['fireball'],
        inventory: [{ itemId: 'potion_hp', count: 2 }],
        equipment: {
          weapon: 'iron_sword',
        },
      };
      data.blueprints.register(goblinBlueprint);

      const factory = new EntityFactory(world, data);
      return { world, data, factory, goblinBlueprint };
    }

    it('블루프린트로부터 완전한 컴포넌트 세트를 가진 엔티티를 생성해야 한다', () => {
      const { factory, world } = setupFactory();

      const listener = vi.fn();
      world.bus.on('entity:spawned', listener);

      const goblin = factory.spawn('goblin_warrior');

      // 1. 태그 검증
      expect(goblin.hasTag('enemy')).toBe(true);
      expect(goblin.hasTag('humanoid')).toBe(true);

      // 2. Identity 검증
      const identity = goblin.get(IdentityComponent);
      expect(identity).toBeDefined();
      expect(identity?.name).toBe('고블린 전사');
      expect(identity?.idx).toBe(201);
      expect(identity?.description).toBe('성질이 사나운 고블린');

      // 3. Stats 검증
      const stats = goblin.get(StatsComponent);
      expect(stats).toBeDefined();
      expect(stats?.maxHp).toBe(60);
      expect(stats?.hp).toBe(60);
      expect(stats?.attack).toBe(12);

      // 4. Skills 검증 (스킬 레지스트리 연계)
      const skills = goblin.get(SkillsComponent);
      expect(skills).toBeDefined();
      expect(skills?.knows('fireball')).toBe(true);
      expect(skills?.getDef('fireball')?.name).toBe('화염구');

      // 5. Inventory 검증
      const inv = goblin.get(InventoryComponent);
      expect(inv).toBeDefined();
      expect(inv?.getQuantity('potion_hp')).toBe(2);

      // 6. Equipment 검증
      const eq = goblin.get(EquipmentComponent);
      expect(eq).toBeDefined();
      expect(eq?.isEquipped('weapon')).toBe(true);
      expect(eq?.equippedWeaponTypes).toContain('sword');

      // 7. 이벤트 발행 검증
      expect(listener).toHaveBeenCalledWith({
        entityId: goblin.id,
        blueprintId: 'goblin_warrior',
        tags: ['enemy', 'humanoid'],
      });
    });

    it('SpawnOptions를 통해 이름 및 스탯을 오버라이드할 수 있어야 한다', () => {
      const { factory } = setupFactory();

      const bossGoblin = factory.spawn('goblin_warrior', {
        name: '고블린 족장',
        tags: ['boss'],
        overrideStats: {
          maxHp: 300,
          attack: 30,
        },
        extraInventory: [{ itemId: 'potion_hp', count: 5 }],
      });

      expect(bossGoblin.hasTag('boss')).toBe(true);
      expect(bossGoblin.get(IdentityComponent)?.name).toBe('고블린 족장');
      expect(bossGoblin.get(StatsComponent)?.maxHp).toBe(300);
      expect(bossGoblin.get(StatsComponent)?.attack).toBe(30);
      // 오버라이드 안 한 스탯은 기본값 유지
      expect(bossGoblin.get(StatsComponent)?.defense).toBe(4);
      // 인벤토리는 기존 2개 + 추가 5개 = 7개
      expect(bossGoblin.get(InventoryComponent)?.getQuantity('potion_hp')).toBe(7);
    });

    it('커스텀 컴포넌트 핸들러를 플러그인 형태로 등록하여 확장할 수 있어야 한다', () => {
      const { factory, data } = setupFactory();

      // 외부 프로젝트가 정의한 가상의 커스텀 컴포넌트
      class AIBehaviorComponent extends Component {
        constructor(public behavior: string, public aggroRadius: number) {
          super();
        }
      }

      // 팩토리에 핸들러 플러그인 등록
      factory.registerComponentHandler('ai', (entity, rawConfig) => {
        const config = rawConfig as { type: string; radius: number };
        entity.add(new AIBehaviorComponent(config.type, config.radius));
      });

      // 블루프린트에 custom 설정 추가
      data.blueprints.register({
        id: 'patrol_guard',
        identity: { name: '경비병' },
        custom: {
          ai: { type: 'patrol', radius: 15 },
        },
      });

      const guard = factory.spawn('patrol_guard');
      const aiComp = guard.get(AIBehaviorComponent);

      expect(aiComp).toBeDefined();
      expect(aiComp?.behavior).toBe('patrol');
      expect(aiComp?.aggroRadius).toBe(15);
    });

    it('존재하지 않는 블루프린트 ID로 스폰 시 에러를 던져야 한다', () => {
      const { factory } = setupFactory();
      expect(() => factory.spawn('non_existent')).toThrowError(/Entry with ID 'non_existent' not found/);
    });

    it('createItemEntity를 통해 월드 아이템 오브젝트를 생성할 수 있어야 한다', () => {
      const { factory } = setupFactory();
      const dropItem = factory.createItemEntity('potion_hp', { tags: ['loot'] });

      expect(dropItem.hasTag('item')).toBe(true);
      expect(dropItem.hasTag('loot')).toBe(true);
      const itemDefComp = dropItem.get(ItemDefComponent);
      expect(itemDefComp).toBeDefined();
      expect(itemDefComp?.name).toBe('체력 포션');
      expect(itemDefComp?.value).toBe(30);
    });
  });
});
