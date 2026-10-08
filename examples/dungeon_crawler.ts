/**
 * GameCore 실전 예제: 턴제 던전 탐험 & 전투 RPG 시뮬레이션
 *
 * 이 예제는 gamecore 패키지만을 사용하여
 * 1. 게임 마스터 데이터(아이템, 스킬, 몬스터/플레이어 블루프린트) 정의
 * 2. 타일 맵 생성 및 엔티티 스폰 (Factory)
 * 3. 장비 착용 및 스탯 자동 반영 (EquipmentSystem)
 * 4. 턴제 전투 진행 (TurnSystem, CombatSystem, SkillSystem)
 * 5. 몬스터 처치 후 전리품 획득 및 레벨업 (LootSystem, ProgressionSystem)
 * 6. 게임 상태 저장 및 복원 (WorldSerializer)
 * 전 과정을 보여주는 완결된 게임 루프입니다.
 */

import {
  World,
  DataManager,
  EntityFactory,
  CombatSystem,
  SkillSystem,
  InventorySystem,
  StatModSystem,
  EquipmentSystem,
  ProgressionSystem,
  LootSystem,
  TurnSystem,
  MovementSystem,
  GridMap,
  WorldSerializer,
  IdentityComponent,
  StatsComponent,
  PositionComponent,
  TurnComponent,
  InventoryComponent,
  ProgressionComponent,
  LootComponent,
  StatModsComponent,
} from '../src';

export function runDungeonCrawlerDemo() {
  console.log('=== [GameCore] 턴제 던전 RPG 시뮬레이션 시작 ===\n');

  // 1. 마스터 데이터 세팅
  const data = new DataManager();

  // 아이템 등록
  data.items.registerMany([
    {
      id: 'rune_sword',
      name: '고대 룬 검',
      category: 'weapon',
      spec: { weaponType: 'sword', attack: 20 },
      description: '고대 문자가 새겨진 날카로운 양손검',
    },
    {
      id: 'potion_hp',
      name: '체력 물약',
      category: 'consumable',
      value: 30,
    },
    {
      id: 'gold_coin',
      name: '금화',
      category: 'material',
      value: 1,
    },
  ]);

  // 스킬 등록
  data.skills.register({
    id: 'flame_slash',
    name: '화염 베기',
    mpCost: 15,
    cooldown: 0,
    targetType: 'single_enemy',
    effects: [
      { type: 'damage', basePower: 35, scaling: { attack: 1.2 } },
      { type: 'status', statusId: 'burn', chance: 1.0, duration: 3000 },
    ],
  });

  // 블루프린트 등록
  data.blueprints.registerMany([
    {
      id: 'hero',
      tags: ['player'],
      identity: { name: '용사 로이드', description: '던전에 도전하는 전사' },
      stats: { maxHp: 120, maxMp: 50, attack: 15, defense: 5, speed: 12 },
      skills: ['flame_slash'],
      inventory: [
        { itemId: 'rune_sword', count: 1 },
        { itemId: 'potion_hp', count: 3 },
      ],
    },
    {
      id: 'goblin_scout',
      tags: ['enemy'],
      identity: { name: '고블린 정찰병', description: '던전 입구를 지키는 몬스터' },
      stats: { maxHp: 45, attack: 8, defense: 2, speed: 8 },
    },
  ]);

  // 2. 던전 맵 생성 (6x4 룸)
  const map = GridMap.fromASCII(
    [
      '######',
      '#....#',
      '#....#',
      '######',
    ],
    {
      '#': { type: 'wall', walkable: false },
      '.': { type: 'floor', walkable: true },
    },
  );

  // 3. 월드 및 시스템 구성
  const world = new World();
  const combat = new CombatSystem();
  const statMods = new StatModSystem();
  const skills = new SkillSystem(undefined, statMods);
  const inventory = new InventorySystem();
  const equipment = new EquipmentSystem(data, undefined, statMods);
  const progression = new ProgressionSystem();
  const loot = new LootSystem(progression);
  const turn = new TurnSystem();
  const movement = new MovementSystem(map);

  world.addSystem(combat);
  world.addSystem(statMods);
  world.addSystem(skills);
  world.addSystem(inventory);
  world.addSystem(equipment);
  world.addSystem(progression);
  world.addSystem(loot);
  world.addSystem(turn);
  world.addSystem(movement);

  // 4. 엔티티 스폰 (Factory)
  const factory = new EntityFactory(world, data);

  const hero = factory.spawn('hero');
  hero.add(new PositionComponent({ x: 1, y: 1 }))
      .add(new TurnComponent({ maxActionPoints: 2 }))
      .add(new ProgressionComponent({ level: 1, expFormula: () => 50 }))
      .add(new StatModsComponent());

  const goblin = factory.spawn('goblin_scout');
  goblin.add(new PositionComponent({ x: 2, y: 1 }))
        .add(new TurnComponent())
        .add(new LootComponent({
          exp: 60,
          items: [{ itemId: 'gold_coin', chance: 1.0, min: 10, max: 10 }],
        }));

  // 이벤트 로깅
  world.bus.on('combat:damage', (e) => {
    console.log(`[전투] 엔티티 ${e.attackerId} -> ${e.targetId} 에게 ${e.effective} 데미지! (치명타: ${e.isCritical})`);
  });
  world.bus.on('progression:levelup', (e) => {
    console.log(`🎉 [레벨업] 엔티티 ${e.entityId} 레벨 상승! (${e.oldLevel} -> ${e.newLevel}) 스탯 증가:`, e.statsGained);
  });
  world.bus.on('loot:dropped', (e) => {
    console.log(`💰 [전리품] 몬스터 처치! 획득 EXP: ${e.exp}, 아이템:`, e.items);
  });

  // 5. 턴제 전투 시뮬레이션
  world.update(16);
  turn.startRound();
  console.log(`[턴 시작] 1라운드 시작! 턴 순서:`, turn.turnQueue);

  // 로이드 턴: 무기 착용
  console.log(`[행동] 로이드가 인벤토리에서 '고대 룬 검'을 장착합니다.`);
  equipment.requestEquip({ entityId: hero.id, slot: 'weapon', itemId: 'rune_sword' });
  world.update(16);

  const heroStats = hero.get(StatsComponent)!;
  const heroMods = hero.get(StatModsComponent)!;
  console.log(`[상태] 무기 장착 후 로이드 공격력: ${heroStats.attack} -> 최종 계산 공격력: ${heroMods.compute('attack', heroStats.attack)}`);

  // 로이드 턴: 스킬 '화염 베기' 공격
  console.log(`[행동] 로이드가 고블린에게 '화염 베기' 시전!`);
  skills.useSkill({
    casterId: hero.id,
    skillId: 'flame_slash',
    targetIds: [goblin.id],
  });
  world.update(16);

  const goblinStats = goblin.get(StatsComponent)!;
  console.log(`[상태] 공격 후 고블린 잔여 HP: ${goblinStats.hp}/${goblinStats.maxHp}`);

  // 고블린 사망 확인 및 전리품 처리
  if (goblinStats.isDead) {
    console.log(`[전투] 고블린 정찰병이 쓰러졌습니다!`);
    loot.processLoot(goblin.id, hero.id);
    world.update(16);
  }

  // 6. 결과 확인
  const heroProg = hero.get(ProgressionComponent)!;
  const heroInv = hero.get(InventoryComponent)!;
  console.log(`\n=== 최종 영웅 상태 ===`);
  console.log(`- 이름: ${hero.get(IdentityComponent)?.name}`);
  console.log(`- 레벨: ${heroProg.level} (경험치: ${heroProg.currentExp}/${heroProg.requiredExp})`);
  console.log(`- 체력: ${heroStats.hp}/${heroStats.maxHp}`);
  console.log(`- 소지 금화: ${heroInv.getQuantity('gold_coin')} 개`);

  // 7. 세이브 & 로드 검증
  const serializer = new WorldSerializer();
  const saveJson = serializer.toJSON(world);
  console.log(`\n💾 [세이브] 게임 상태를 JSON으로 직렬화했습니다. (${saveJson.length} bytes)`);

  const newWorld = new World();
  serializer.deserialize(saveJson, newWorld);
  console.log(`📂 [로드] 새로운 월드에 저장 데이터를 복원했습니다. 복원된 엔티티 수: ${newWorld.entities.length}개`);
  console.log('\n=== [GameCore] 시뮬레이션 성공 완료! ===');

  return { world, newWorld, hero, heroProg, heroInv };
}
