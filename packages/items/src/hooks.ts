import type { Definition, HookTable, Type } from '@jsprismarine/content';

import type { ItemStack } from './ItemStack';

/**
 * A block position in world coordinates.
 *
 * Declared here rather than imported so the item runtime depends on no world
 * implementation; the server's own vector type is assignable to it.
 */
export interface BlockPosition {
    x: number;
    y: number;
    z: number;
}

/**
 * The entity a hook acts for, usually the player holding the item.
 *
 * The item runtime never reads past these two fields. A behavior that needs
 * more narrows the value itself, which is the seam: widening this interface is
 * a change to every behavior, narrowing inside one behavior is not.
 */
export interface ItemSource {
    /** The Bedrock entity identifier, such as `minecraft:player`. */
    readonly identifier: string;
    /** The entity's runtime id, unique for the length of the session. */
    readonly runtimeId: number;
    /** The entity's exact position in world coordinates, when the caller has it. */
    readonly position?: BlockPosition;
}

/** The block a hook acts on, named the way Bedrock names one. */
export interface BlockReference {
    /** The Bedrock block identifier, such as `minecraft:grass_block`. */
    readonly identifier: string;
    /** The block state values, keyed by Bedrock state name. */
    readonly states: Readonly<Record<string, string | number | boolean>>;
    /** Where the block is. */
    readonly position: BlockPosition;
}

/** The face of a block an interaction landed on. */
export type BlockFace = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

/**
 * What a use hook reports back.
 *
 * Returning any result at all means the hook handled the interaction, because
 * {@link HookTable.dispatchFirst} stops at the first handler that returns
 * something other than undefined. A hook that declines returns undefined and
 * the next handler, and then the engine's default action, runs.
 */
export interface ItemUseResult {
    /** The stack to put back in the slot, or omitted to leave the slot alone. */
    readonly stack?: ItemStack;
    /** Ticks before the source may use this item again, or omitted for no cooldown. */
    readonly cooldownTicks?: number;
}

/** What {@link ItemHooks.onUse} receives. */
export interface ItemUseEvent {
    /** The stack being used. */
    readonly itemStack: ItemStack;
    /** Who is using it. */
    readonly source: ItemSource;
    /** How long the use button has been held, in ticks. Zero on the first tick of a use. */
    readonly useDuration: number;
}

/** What {@link ItemHooks.onUseOn} receives. */
export interface ItemUseOnEvent extends ItemUseEvent {
    /** The block the use landed on. */
    readonly block: BlockReference;
    /** Which face of that block. */
    readonly blockFace: BlockFace;
    /** Where on the face, each coordinate from 0 to 1. */
    readonly faceLocation: BlockPosition;
}

/** What {@link ItemHooks.onMineBlock} receives. */
export interface ItemMineBlockEvent {
    /** The stack that broke the block. */
    readonly itemStack: ItemStack;
    /** Who swung it. */
    readonly source: ItemSource;
    /** The block as it was before it broke. */
    readonly block: BlockReference;
}

/** What {@link ItemHooks.onHitEntity} receives. */
export interface ItemHitEntityEvent {
    /** The stack that landed the hit. */
    readonly itemStack: ItemStack;
    /** Who attacked. */
    readonly source: ItemSource;
    /** Who was hit. */
    readonly hitEntity: ItemSource;
    /** Whether the hit dealt damage, false for a hit a target blocked or absorbed. */
    readonly hadEffect: boolean;
}

/** What {@link ItemHooks.onBeforeDurabilityDamage} receives. */
export interface ItemBeforeDurabilityDamageEvent {
    /** The stack about to take durability damage. */
    readonly itemStack: ItemStack;
    /** Who is using it. */
    readonly source: ItemSource;
    /** The entity the hit landed on, absent when the damage is not from an attack. */
    readonly hitEntity?: ItemSource;
    /** The damage the engine is about to apply. */
    readonly durabilityDamage: number;
}

/** What {@link ItemHooks.onCompleteUse} receives. */
export interface ItemCompleteUseEvent extends ItemUseEvent {}

/** What {@link ItemHooks.onConsume} receives. */
export interface ItemConsumeEvent {
    /** The stack being eaten or drunk. */
    readonly itemStack: ItemStack;
    /** Who consumed it. */
    readonly source: ItemSource;
}

/**
 * The hooks an item behavior implements, the seam between this package and the
 * behavior families built on it.
 *
 * The seven names are Mojang's `ItemCustomComponent` names, unchanged, so a
 * script host that exposes Mojang's interface maps onto this table one name at
 * a time. The signatures differ in two ways, both deliberate. Each hook takes
 * one event object, as Mojang's do, but the event carries this package's own
 * {@link ItemStack} rather than a scripting handle. And the hooks a caller can
 * cancel return a value instead of mutating the event, because
 * {@link HookTable.dispatchFirst} decides who handled an interaction by the
 * first result that is not undefined.
 *
 * Dispatch order is the component order of the item's definition, then
 * behaviors in attachment order, so a behavior the server registers has the
 * last word over a component a pack declared. A contribution marked `override`
 * clears the handlers collected before it.
 */
export interface ItemHooks {
    /** Right-click in the air, or the first tick of a held use. */
    onUse: (event: ItemUseEvent) => ItemUseResult | undefined;
    /** Right-click on a block. Runs before {@link ItemHooks.onUse}. */
    onUseOn: (event: ItemUseOnEvent) => ItemUseResult | undefined;
    /** A block broke while this item was held. */
    onMineBlock: (event: ItemMineBlockEvent) => void;
    /** An attack with this item landed on an entity. */
    onHitEntity: (event: ItemHitEntityEvent) => void;
    /**
     * Durability damage is about to apply.
     *
     * @returns The damage to apply instead, 0 to spend no durability, or
     *   undefined to leave the engine's figure alone.
     */
    onBeforeDurabilityDamage: (event: ItemBeforeDurabilityDamageEvent) => number | undefined;
    /** A held use ran to the end of its duration without being released early. */
    onCompleteUse: (event: ItemCompleteUseEvent) => ItemUseResult | undefined;
    /** A consumable finished being eaten or drunk. */
    onConsume: (event: ItemConsumeEvent) => ItemUseResult | undefined;
}

/** Every hook name {@link ItemHooks} declares, in Mojang's documented order. */
export const ITEM_HOOKS = [
    'onUse',
    'onUseOn',
    'onMineBlock',
    'onHitEntity',
    'onBeforeDurabilityDamage',
    'onCompleteUse',
    'onConsume'
] as const satisfies readonly (keyof ItemHooks)[];

/** The load-time flags an item type carries, computed once in `resolveItemTypes`. */
export type ItemFlag = 'isFood' | 'isTool' | 'isWeapon' | 'isDamageable' | 'isEquippable' | 'isFuel';

/** One resolved item type: a Bedrock identity with Java defaults and Bedrock data kept separate. */
export interface ItemType extends Type<ItemHooks, ItemFlag> {
    /** The Bedrock item JSON used to build the client-facing part, when one was loaded. */
    readonly bedrockDefinition?: Definition;
    /** The raw Bedrock item components declared by the active behavior pack, by component name. */
    readonly bedrockComponents: ReadonlyMap<string, unknown>;
    /** The Bedrock tags attached to this item identity. */
    readonly tags: readonly string[];
    /** Whether this item identity carries one of its Bedrock tags. */
    hasTag(tag: string): boolean;
}

/** The dispatch table one item type binds at load. */
export type ItemHookTable = HookTable<ItemHooks>;
