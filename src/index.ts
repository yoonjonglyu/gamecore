/**
 * @module GameCore
 * ECS(Entity-Component-System) + EventBus 기반 게임 상태 & 모델 코어 엔진.
 *
 * 브라우저, Node.js, Web Worker, React Native, Wasm/Godot 브릿지 등 100% 플랫폼 독립적 동작 보장.
 * 0-Dependency 순수 TypeScript 아키텍처.
 */

// ─── Core ECS ─────────────────────────────────
export { World } from './core/World';
export type { WorldListener, WorldChangeEvent, WorldOptions } from './core/World';
export { Entity } from './core/Entity';
export type { EntityListener, EntityChange, EntityChangeType, EntityWorldEmitter } from './core/Entity';
export { Component } from './core/Component';
export type { ComponentType } from './core/Component';
export { System } from './core/System';
export { EventBus } from './core/EventBus';
export type { EventMap, EventHandler } from './core/EventBus';
export { GameWorldManager } from './core/GameWorldManager';
export type { GameWorldManagerOptions } from './core/GameWorldManager';

// ─── Blackboard & Scheduling ──────────────────
export { Blackboard } from './core/Blackboard';
export type { BlackboardListener } from './core/Blackboard';
export { TimerScheduler } from './core/TimerScheduler';
export type { ScheduledTask, TaskScheduleMode } from './core/TimerScheduler';

// ─── Math, PRNG & Precision ───────────────────
export { SeededRandom } from './math/SeededRandom';
export type { PRNGState } from './math/SeededRandom';
export {
  applyRounding,
  DEFAULT_ROUNDING_CONFIG,
} from './math/RoundingPolicy';
export type { RoundingMode, CombatRoundingConfig } from './math/RoundingPolicy';

// ─── Components ───────────────────────────────
export { StatsComponent } from './components/StatsComponent';
export type { StatsProps } from './components/StatsComponent';
export { ExtendedStatsComponent } from './components/ExtendedStatsComponent';
export type { ExtendedStatsInit } from './components/ExtendedStatsComponent';
export { BarrierComponent } from './components/BarrierComponent';
export type { BarrierProps, BarrierAbsorbResult } from './components/BarrierComponent';
export { IdentityComponent } from './components/IdentityComponent';
export { InventoryComponent } from './components/InventoryComponent';
export type { ItemEntry } from './components/InventoryComponent';
export { ItemDefComponent } from './components/ItemDefComponent';
export type { ItemCategory, ItemSpec } from './components/ItemDefComponent';
export { ClassComponent } from './components/ClassComponent';
export { EquipmentComponent } from './components/EquipmentComponent';
export type { EquipSlot, EquippedItem } from './components/EquipmentComponent';
export { StatModsComponent, ModsComponent } from './components/StatModsComponent';
export type { StatModifier, ModifiableStat } from './components/StatModsComponent';
export { ProgressionComponent } from './components/ProgressionComponent';
export type { StatGrowth, ExpFormula, ProgressionProps } from './components/ProgressionComponent';
export { LootComponent } from './components/LootComponent';
export type { LootItemEntry, LootProps } from './components/LootComponent';
export { FSMComponent } from './components/FSMComponent';
export type { StateConfig, StateTransitionRule, FSMSerializedState } from './components/FSMComponent';
export { QuestsComponent } from './components/QuestsComponent';
export type {
  QuestDef,
  QuestInstance,
  QuestObjective,
  QuestReward,
  QuestState,
} from './components/QuestsComponent';

// ─── Stat Pipeline Engine ─────────────────────
export { StatPipeline } from './stats/StatPipeline';
export type {
  StatReader,
  StatFormula,
  StatDefinition,
  PipelineStatModifier,
  StatCalculationBreakdown,
} from './stats/StatPipeline';

// ─── Combat & Cue Protocol ───────────────────
export type {
  DamageType,
  AttackRequest,
  CombatContext,
  DamageCalculator,
  CombatMiddleware,
} from './combat/CombatPipeline';
export {
  DefaultDamageCalculator,
  DefaultPreHitMiddleware,
  DefaultShieldAbsorbMiddleware,
  DefaultPostHitMiddleware,
} from './combat/CombatPipeline';
export { CueQueue, createCue } from './combat/CueProtocol';
export type {
  CuePayload,
  CueEvent,
  CueShakeConfig,
  CueFlashConfig,
} from './combat/CueProtocol';

// ─── Constraints ──────────────────────────────
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

// ─── Systems ──────────────────────────────────
export { CombatSystem } from './systems/CombatSystem';
export type { CombatSystemOptions } from './systems/CombatSystem';
export { InventorySystem } from './systems/InventorySystem';
export type { InventoryRequest } from './systems/InventorySystem';
export { SkillSystem } from './systems/SkillSystem';
export type { UseSkillRequest, CanCastResult, CastSkillResult } from './systems/SkillSystem';
export { StatusEffectSystem } from './systems/StatusEffectSystem';
export type { ApplyStatusOptions } from './systems/StatusEffectSystem';
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
export { FSMSystem } from './systems/FSMSystem';
export { QuestSystem } from './systems/QuestSystem';

// ─── Spatial & Grid ───────────────────────────
export { PositionComponent } from './spatial/PositionComponent';
export type { PositionProps } from './spatial/PositionComponent';
export { GridMap } from './spatial/GridMap';
export type { Tile } from './spatial/GridMap';
export { MovementSystem } from './spatial/MovementSystem';
export type { MoveRequest } from './spatial/MovementSystem';
export { SpatialHashGrid } from './spatial/SpatialHashGrid';

// ─── Skills ───────────────────────────────────
export type {
  SkillDef,
  SkillEffectDef,
  DamageEffect,
  HealEffect,
  StatusEffect,
  StatModEffect,
  TargetType,
} from './skills/SkillDef';
export { SkillEffectExecutor } from './skills/SkillEffectExecutor';
export type { SkillEffectContext, SkillEffectHandler } from './skills/SkillEffectExecutor';
export { SkillsComponent } from './components/SkillsComponent';
export type { SkillSlot } from './components/SkillsComponent';
export { StatusEffectsComponent } from './components/StatusEffectsComponent';
export type { StatusInstance } from './components/StatusEffectsComponent';

// ─── Data & Procedural Generation ────────────
export { Registry } from './data/Registry';
export type { Identifiable } from './data/Registry';
export { DataManager } from './data/DataManager';
export type { GameDataBundle } from './data/DataManager';
export { ItemDef } from './data/ItemDef';
export { DropTable } from './data/DropTable';
export type { DropEntry, DropResult } from './data/DropTable';
export { AffixGenerator } from './data/AffixGenerator';
export type {
  AffixDef,
  AffixType,
  RolledAffix,
  GeneratedItem,
  RarityRule,
} from './data/AffixGenerator';

// ─── Factory & Blueprints ─────────────────────
export type { EntityBlueprint, SpawnOptions, BlueprintItemEntry } from './factory/Blueprint';
export { EntityFactory } from './factory/EntityFactory';
export type { CustomComponentHandler, FactoryContext } from './factory/EntityFactory';

// ─── Serialization & SaveManager ─────────────
export { ComponentRegistry, defaultComponentRegistry } from './serialization/ComponentRegistry';
export type { ComponentSerializer, ComponentDeserializer, ComponentRegistration } from './serialization/ComponentRegistry';
export { WorldSerializer, defaultWorldSerializer } from './serialization/WorldSerializer';
export type { SerializedWorld, SerializedEntity, SerializedComponent, SerializeOptions, DeserializeOptions } from './serialization/WorldSerializer';
export { SaveManager } from './serialization/SaveManager';
export type { SaveEnvelope, DeserializationResult, MigrationFunction, MigrationStep } from './serialization/SaveManager';
export { sha256, hmacSha256 } from './serialization/crypto';

// ─── Events ───────────────────────────────────
export type { CoreEvents } from './events';
