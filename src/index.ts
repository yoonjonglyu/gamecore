/**
 * GameCore — 공개 API 진입점
 *
 * 사용 예시:
 * ```ts
 * import { World, StatsComponent, IdentityComponent, CombatSystem, CoreEvents } from 'gamecore';
 *
 * const world = new World<CoreEvents>();
 * const combat = new CombatSystem();
 * world.addSystem(combat);
 *
 * const player = world.createEntity('player');
 * player.add(new IdentityComponent(1, 'Hero')).add(new StatsComponent({ maxHp: 200 }));
 *
 * world.bus.on('stats:died', ({ entityId }) => console.log(entityId, 'died'));
 * combat.requestAttack({ attackerId: enemy.id, targetId: player.id });
 * world.update(16); // 16ms 틱
 * ```
 */

// ─── Core ────────────────────────────────────────────────────────────────────
export { Component } from './core/Component';
export type { ComponentType } from './core/Component';
export { Entity } from './core/Entity';
export { EventBus } from './core/EventBus';
export type { EventMap } from './core/EventBus';
export { System } from './core/System';
export { World } from './core/World';

// ─── Components ──────────────────────────────────────────────────────────────
export { StatsComponent } from './components/StatsComponent';
export type { Stats } from './components/StatsComponent';
export { IdentityComponent } from './components/IdentityComponent';
export { InventoryComponent } from './components/InventoryComponent';
export type { ItemEntry } from './components/InventoryComponent';
export { ItemDefComponent } from './components/ItemDefComponent';
export type { ItemCategory, ItemSpec } from './components/ItemDefComponent';
export { ClassComponent } from './components/ClassComponent';
export { EquipmentComponent } from './components/EquipmentComponent';
export type { EquipSlot, EquippedItem } from './components/EquipmentComponent';
export { StatModsComponent } from './components/StatModsComponent';
export type { StatModifier, ModifiableStat } from './components/StatModsComponent';
export { ProgressionComponent } from './components/ProgressionComponent';
export type { StatGrowth, ExpFormula, ProgressionProps } from './components/ProgressionComponent';
export { LootComponent } from './components/LootComponent';
export type { LootItemEntry, LootProps } from './components/LootComponent';

// ─── Constraints ─────────────────────────────────────────────────────────────
export type {
  Constraint,
  ConstraintResult,
  LevelConstraint,
  ClassConstraint,
  WeaponConstraint,
  ElementConstraint,
  StatMinConstraint,
  HasStatusConstraint,
  NotStatusConstraint,
  CustomConstraint,
} from './constraints/Constraint';
export { ConstraintChecker, globalConstraintChecker } from './constraints/ConstraintChecker';
export type { CustomHandler } from './constraints/ConstraintChecker';

// ─── Systems ─────────────────────────────────────────────────────────────────
export { CombatSystem } from './systems/CombatSystem';
export type { AttackRequest } from './systems/CombatSystem';
export { InventorySystem } from './systems/InventorySystem';
export type { InventoryRequest } from './systems/InventorySystem';
export { SkillSystem } from './systems/SkillSystem';
export type { UseSkillRequest } from './systems/SkillSystem';
export { StatModSystem } from './systems/StatModSystem';
export type { AddModRequest, RemoveModRequest } from './systems/StatModSystem';
export { EquipmentSystem } from './systems/EquipmentSystem';
export type { EquipRequest, UnequipRequest } from './systems/EquipmentSystem';
export { ProgressionSystem } from './systems/ProgressionSystem';
export type { AddExpRequest } from './systems/ProgressionSystem';
export { LootSystem } from './systems/LootSystem';
export type { ProcessLootRequest } from './systems/LootSystem';
export { TurnSystem } from './systems/TurnSystem';
export { TurnComponent } from './components/TurnComponent';
export type { TurnProps } from './components/TurnComponent';

// ─── Spatial & Grid ──────────────────────────────────────────────────────────
export { PositionComponent } from './spatial/PositionComponent';
export type { PositionProps } from './spatial/PositionComponent';
export { GridMap } from './spatial/GridMap';
export type { Tile } from './spatial/GridMap';
export { MovementSystem } from './spatial/MovementSystem';
export type { MoveRequest } from './spatial/MovementSystem';

// ─── Skills ──────────────────────────────────────────────────────────────────
export type {
  SkillDef,
  SkillEffectDef,
  DamageEffect,
  HealEffect,
  StatusEffect,
  StatModEffect,
  TargetType,
} from './skills/SkillDef';
export { SkillsComponent } from './components/SkillsComponent';
export type { SkillSlot } from './components/SkillsComponent';
export { StatusEffectsComponent } from './components/StatusEffectsComponent';
export type { StatusInstance } from './components/StatusEffectsComponent';

// ─── Data & Registry ─────────────────────────────────────────────────────────
export { Registry } from './data/Registry';
export type { Identifiable } from './data/Registry';
export { DataManager } from './data/DataManager';
export type { GameDataBundle } from './data/DataManager';
export type { ItemDef } from './data/ItemDef';

// ─── Factory & Blueprints ────────────────────────────────────────────────────
export type { EntityBlueprint, SpawnOptions, BlueprintItemEntry } from './factory/Blueprint';
export { EntityFactory } from './factory/EntityFactory';
export type { CustomComponentHandler, FactoryContext } from './factory/EntityFactory';

// ─── Serialization & Save/Load ───────────────────────────────────────────────
export { ComponentRegistry, defaultComponentRegistry } from './serialization/ComponentRegistry';
export type { ComponentSerializer, ComponentDeserializer, ComponentRegistration } from './serialization/ComponentRegistry';
export { WorldSerializer, defaultWorldSerializer } from './serialization/WorldSerializer';
export type { SerializedWorld, SerializedEntity, SerializedComponent, SerializeOptions, DeserializeOptions } from './serialization/WorldSerializer';

// ─── Events ──────────────────────────────────────────────────────────────────
export type { CoreEvents } from './events';
