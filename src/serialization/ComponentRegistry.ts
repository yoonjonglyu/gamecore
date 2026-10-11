/**
 * @module serialization/ComponentRegistry
 * 컴포넌트 클래스와 직렬화용 문자열 식별자를 매핑하는 레지스트리.
 * 내장 컴포넌트들을 기본 등록하고, 사용자 커스텀 컴포넌트도 등록할 수 있다.
 */

import { Component, ComponentType } from '../core/Component';
import { StatsComponent } from '../components/StatsComponent';
import { IdentityComponent } from '../components/IdentityComponent';
import { InventoryComponent } from '../components/InventoryComponent';
import { EquipmentComponent } from '../components/EquipmentComponent';
import { ClassComponent } from '../components/ClassComponent';
import { ProgressionComponent } from '../components/ProgressionComponent';
import { LootComponent } from '../components/LootComponent';
import { TurnComponent } from '../components/TurnComponent';
import { PositionComponent } from '../spatial/PositionComponent';
import { BarrierComponent } from '../components/BarrierComponent';
import { ExtendedStatsComponent } from '../components/ExtendedStatsComponent';
import { FSMComponent } from '../components/FSMComponent';
import { QuestsComponent } from '../components/QuestsComponent';
import { HierarchyComponent } from '../components/HierarchyComponent';


export type ComponentSerializer<T extends Component = Component> = (component: T) => Record<string, unknown>;
export type ComponentDeserializer<T extends Component = Component> = (data: Record<string, unknown>) => T;

export interface ComponentRegistration<T extends Component = Component> {
  type: ComponentType<T>;
  name: string;
  serialize?: ComponentSerializer<T>;
  deserialize?: ComponentDeserializer<T>;
}

export class ComponentRegistry {
  private _nameToType = new Map<string, ComponentType>();
  private _typeToName = new Map<ComponentType, string>();
  private _serializers = new Map<string, ComponentSerializer<any>>();
  private _deserializers = new Map<string, ComponentDeserializer<any>>();

  constructor() {
    this._registerDefaults();
  }

  register<T extends Component>(
    name: string,
    type: ComponentType<T>,
    serialize?: ComponentSerializer<T>,
    deserialize?: ComponentDeserializer<T>,
  ): this {
    this._nameToType.set(name, type);
    this._typeToName.set(type, name);
    if (serialize) this._serializers.set(name, serialize);
    if (deserialize) this._deserializers.set(name, deserialize);
    return this;
  }

  getName(type: ComponentType): string | undefined {
    return this._typeToName.get(type);
  }

  getType(name: string): ComponentType | undefined {
    return this._nameToType.get(name);
  }

  serializeComponent(comp: Component): { type: string; data: Record<string, unknown> } | undefined {
    const compType = comp.constructor as ComponentType;
    const name = this.getName(compType);
    if (!name) return undefined;

    const customSerializer = this._serializers.get(name);
    if (customSerializer) {
      return { type: name, data: customSerializer(comp) };
    }

    // 기본 직렬화: public 필드 복사 (entity, entityId, 프라이빗, 함수 제외)
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(comp)) {
      if (k === 'entity' || k === 'entityId' || k.startsWith('_') || typeof v === 'function') continue;
      data[k] = v;
    }

    return { type: name, data };
  }

  deserializeComponent(typeStr: string, data: Record<string, unknown>): Component | undefined {
    const customDeserializer = this._deserializers.get(typeStr);
    if (customDeserializer) {
      return customDeserializer(data);
    }

    const CompType = this.getType(typeStr);
    if (!CompType) return undefined;

    // 기본 역직렬화 (인스턴스 생성 후 필드 주입)
    const instance = new CompType();
    Object.assign(instance, data);
    return instance;
  }

  private _registerDefaults(): void {
    // IdentityComponent
    this.register('IdentityComponent', IdentityComponent);

    // StatsComponent
    this.register(
      'StatsComponent',
      StatsComponent,
      (c) => ({
        hp: c.hp,
        maxHp: c.maxHp,
        mp: c.mp,
        maxMp: c.maxMp,
        attack: c.attack,
        defense: c.defense,
        speed: c.speed,
      }),
      (d) => new StatsComponent(d as any),
    );

    // InventoryComponent (Map 변환)
    this.register(
      'InventoryComponent',
      InventoryComponent,
      (c) => ({
        maxSlots: c.maxSlots,
        items: c.items,
      }),
      (d) => {
        const inv = new InventoryComponent((d.maxSlots as number) ?? 30);
        const items = (d.items as Array<{ defId: string | number; quantity: number }>) ?? [];
        for (const item of items) {
          inv.add(item.defId, item.quantity);
        }
        return inv;
      },
    );

    // EquipmentComponent
    this.register(
      'EquipmentComponent',
      EquipmentComponent,
      (c) => ({
        slots: Array.from(c.allSlots.entries()),
      }),
      (d) => {
        const eq = new EquipmentComponent();
        const slots = (d.slots as Array<[string, any]>) ?? [];
        for (const [slot, item] of slots) {
          eq.equip(slot as any, item);
        }
        return eq;
      },
    );

    // ProgressionComponent
    this.register(
      'ProgressionComponent',
      ProgressionComponent,
      (c) => ({
        level: c.level,
        currentExp: c.currentExp,
        maxLevel: c.maxLevel,
        growth: c.growth,
      }),
      (d) => new ProgressionComponent(d as any),
    );

    // PositionComponent
    this.register(
      'PositionComponent',
      PositionComponent,
      (c) => ({
        x: c.x,
        y: c.y,
        mapId: c.mapId,
        isBlocked: c.isBlocked,
      }),
      (d) => new PositionComponent(d as any),
    );

    // TurnComponent
    this.register(
      'TurnComponent',
      TurnComponent,
      (c) => ({
        initiative: c.initiative,
        actionPoints: c.actionPoints,
        maxActionPoints: c.maxActionPoints,
      }),
      (d) => new TurnComponent(d as any),
    );

    // ClassComponent
    this.register('ClassComponent', ClassComponent);
    // LootComponent
    this.register('LootComponent', LootComponent);
    // BarrierComponent
    this.register(
      'BarrierComponent',
      BarrierComponent,
      (c) => ({ current: c.current, max: c.max }),
      (d) => new BarrierComponent({ current: d.current as number, max: d.max as number }),
    );

    // ExtendedStatsComponent
    this.register(
      'ExtendedStatsComponent',
      ExtendedStatsComponent,
      (c) => ({
        baseStats: Object.fromEntries(
          c.definedStatNames.map((name) => [name, c.getBase(name)]),
        ),
        currentResources: c.allResources,
        modifiers: c.pipeline.getAllModifiers(),
      }),
      (d) => {
        const ext = new ExtendedStatsComponent({
          baseStats: (d.baseStats as Record<string, number>) ?? {},
          currentResources: (d.currentResources as Record<string, number>) ?? {},
        });
        const mods = (d.modifiers as any[]) ?? [];
        for (const mod of mods) {
          ext.addModifier(mod);
        }
        return ext;
      },
    );

    // FSMComponent
    this.register<FSMComponent>(
      'FSMComponent',
      FSMComponent,
      (c) => c.toJSON() as unknown as Record<string, unknown>,
      (d) => FSMComponent.fromJSON(d as any),
    );

    // QuestsComponent
    this.register<QuestsComponent>(
      'QuestsComponent',
      QuestsComponent,
      (c) => c.toJSON() as unknown as Record<string, unknown>,
      (d) => QuestsComponent.fromJSON(d as any),
    );

    // HierarchyComponent
    this.register<HierarchyComponent>(
      'HierarchyComponent',
      HierarchyComponent,
      (c) => ({
        parentId: c.parentId,
        offsetX: c.offsetX,
        offsetY: c.offsetY,
        cascadeDestroy: c.cascadeDestroy,
      }),
      (d) =>
        new HierarchyComponent({
          parentId: d.parentId as number | undefined,
          offsetX: d.offsetX as number | undefined,
          offsetY: d.offsetY as number | undefined,
          cascadeDestroy: d.cascadeDestroy as boolean | undefined,
        }),
    );
  }
}



export const defaultComponentRegistry = new ComponentRegistry();
