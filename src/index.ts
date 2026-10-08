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

// ─── Events ──────────────────────────────────────────────────────────────────
export type { CoreEvents } from './events';
