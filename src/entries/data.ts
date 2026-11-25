export { Registry } from '../data/Registry';
export type { Identifiable } from '../data/Registry';
export { DataManager } from '../data/DataManager';
export type { GameDataBundle } from '../data/DataManager';
export { DataValidator } from '../data/DataValidator';
export type {
  ValidationSeverity,
  ValidationIssue,
  ValidationReport,
} from '../data/DataValidator';
export type { ItemDef } from '../data/ItemDef';
export { ItemDefComponent } from '../components/ItemDefComponent';
export type { ItemCategory, ItemSpec } from '../components/ItemDefComponent';
export { DropTable } from '../data/DropTable';
export type { DropEntry, DropResult } from '../data/DropTable';
export { AffixGenerator } from '../data/AffixGenerator';
export type {
  AffixDef,
  AffixType,
  RolledAffix,
  GeneratedItem,
  RarityRule,
} from '../data/AffixGenerator';
export { LootComponent } from '../components/LootComponent';
export type { LootItemEntry, LootProps } from '../components/LootComponent';
export { LootSystem } from '../systems/LootSystem';
export type { ProcessLootRequest } from '../systems/LootSystem';
export { EntityFactory } from '../factory/EntityFactory';
export type { CustomComponentHandler, FactoryContext } from '../factory/EntityFactory';
export type { EntityBlueprint, SpawnOptions, BlueprintItemEntry } from '../factory/Blueprint';
export { GachaEngine } from '../gacha/GachaEngine';
export type { GachaPoolConfig, GachaTierDef, GachaResultEntry, PityState } from '../gacha/GachaEngine';
export { OfflineProgressEngine } from '../idle/OfflineProgressEngine';
export type {
  OfflineCalculateOptions,
  OfflineProgressResult,
  StaminaRecoveryConfig,
  StageSimulationConfig,
  TimeUnit,
} from '../idle/OfflineProgressEngine';
