import { describe, it, expect } from 'vitest';
import {
  World,
  WorldSerializer,
  ComponentRegistry,
  StatsComponent,
  IdentityComponent,
  InventoryComponent,
  EquipmentComponent,
  PositionComponent,
  ProgressionComponent,
  Component,
} from '../src';

describe('World Serialization (Save & Load)', () => {
  it('월드의 엔티티와 컴포넌트 상태를 JSON으로 직렬화하고 다른 월드에 완벽히 복원할 수 있어야 한다', () => {
    const originWorld = new World();

    // 1. 플레이어 생성 및 데이터 세팅
    const player = originWorld.createEntity('player', 'hero');
    player
      .add(new IdentityComponent(1, '아르테미스', '궁수 영웅'))
      .add(new StatsComponent({ maxHp: 150, hp: 120, attack: 25, defense: 8 }))
      .add(new PositionComponent({ x: 5, y: 7 }))
      .add(new ProgressionComponent({ level: 3, currentExp: 140 }))
      .add(new InventoryComponent(20));

    const inv = player.get(InventoryComponent)!;
    inv.add('healing_potion', 3);
    inv.add('wooden_bow', 1);

    const eq = new EquipmentComponent();
    eq.equip('weapon', { defId: 'wooden_bow', weaponType: 'bow' });
    player.add(eq);

    // 2. 몬스터 엔티티 생성
    const slime = originWorld.createEntity('enemy', 'slime');
    slime
      .add(new IdentityComponent(2, '초록 슬라임'))
      .add(new StatsComponent({ maxHp: 30, hp: 15 }))
      .add(new PositionComponent({ x: 8, y: 7 }));

    // 3. 직렬화
    const serializer = new WorldSerializer();
    const jsonStr = serializer.toJSON(originWorld);

    expect(jsonStr).toContain('아르테미스');
    expect(jsonStr).toContain('wooden_bow');

    // 4. 새로운 월드에 복원
    const restoredWorld = new World();
    const restoredEntities = serializer.deserialize(jsonStr, restoredWorld);

    expect(restoredEntities).toHaveLength(2);

    // 5. 복원된 플레이어 상태 검증
    const restoredPlayer = restoredWorld.entities.find((e) => e.hasTag('player'))!;
    expect(restoredPlayer).toBeDefined();
    expect(restoredPlayer.hasTag('hero')).toBe(true);

    const restoredId = restoredPlayer.get(IdentityComponent)!;
    expect(restoredId.name).toBe('아르테미스');
    expect(restoredId.description).toBe('궁수 영웅');

    const restoredStats = restoredPlayer.get(StatsComponent)!;
    expect(restoredStats.maxHp).toBe(150);
    expect(restoredStats.hp).toBe(120); // 깎인 HP 유지
    expect(restoredStats.attack).toBe(25);

    const restoredPos = restoredPlayer.get(PositionComponent)!;
    expect(restoredPos.x).toBe(5);
    expect(restoredPos.y).toBe(7);

    const restoredProg = restoredPlayer.get(ProgressionComponent)!;
    expect(restoredProg.level).toBe(3);
    expect(restoredProg.currentExp).toBe(140);

    const restoredInv = restoredPlayer.get(InventoryComponent)!;
    expect(restoredInv.getQuantity('healing_potion')).toBe(3);
    expect(restoredInv.getQuantity('wooden_bow')).toBe(1);

    const restoredEq = restoredPlayer.get(EquipmentComponent)!;
    expect(restoredEq.isEquipped('weapon')).toBe(true);
    expect(restoredEq.getSlot('weapon')?.defId).toBe('wooden_bow');
    expect(restoredEq.getSlot('weapon')?.weaponType).toBe('bow');
  });

  it('사용자 커스텀 컴포넌트도 ComponentRegistry에 등록하여 직렬화/역직렬화할 수 있어야 한다', () => {
    class QuestComponent extends Component {
      questId: string = '';
      completed: boolean = false;
      constructor(questId: string = '', completed: boolean = false) {
        super();
        this.questId = questId;
        this.completed = completed;
      }
    }

    const registry = new ComponentRegistry();
    registry.register(
      'QuestComponent',
      QuestComponent,
      (c) => ({ questId: c.questId, completed: c.completed }),
      (d) => new QuestComponent(d.questId as string, d.completed as boolean),
    );

    const serializer = new WorldSerializer(registry);
    const world1 = new World();
    const entity1 = world1.createEntity('hero');
    entity1.add(new QuestComponent('main_quest_01', true));

    const json = serializer.toJSON(world1);
    expect(json).toContain('main_quest_01');

    const world2 = new World();
    serializer.deserialize(json, world2);

    const restored = world2.entities[0];
    const questComp = restored.get(QuestComponent)!;
    expect(questComp).toBeDefined();
    expect(questComp.questId).toBe('main_quest_01');
    expect(questComp.completed).toBe(true);
  });

  it('filterEntity 옵션으로 특정 엔티티만 필터링하여 저장할 수 있어야 한다', () => {
    const world = new World();
    world.createEntity('player').add(new IdentityComponent(1, '플레이어'));
    world.createEntity('enemy').add(new IdentityComponent(2, '슬라임'));

    const serializer = new WorldSerializer();
    const saveState = serializer.serialize(world, {
      filterEntity: (e) => e.hasTag('player'),
    });

    expect(saveState.entities).toHaveLength(1);
    expect(saveState.entities[0].tags).toContain('player');
  });
});
