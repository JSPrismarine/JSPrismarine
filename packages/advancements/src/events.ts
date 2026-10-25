import { PredicateContext } from '@jsprismarine/predicates';
import type {
    BlockEntityView,
    BlockState,
    ContentView,
    DamageSource,
    DiagnosticCollector,
    EnchantmentView,
    EntityView,
    ItemStack,
    ItemStackOps,
    LevelView,
    RandomSource,
    Vec3
} from '@jsprismarine/predicates';

/**
 * What every advancement event carries. `player` is the subject of the
 * `player` field that all 57 non-`impossible` triggers accept.
 */
export interface PlayerEvent {
    readonly player: EntityView;
}

/** An event about one other entity, such as the animal a player tamed. */
export interface EntityEvent extends PlayerEvent {
    readonly entity: EntityView;
}

/** A death, raised once for the killer and once for the victim. */
export interface KillEvent extends EntityEvent {
    /** The blow that killed, read by `player_killed_entity`'s `killing_blow`. */
    readonly damageSource?: DamageSource;
}

/** A block a player entered or slid down. */
export interface BlockEvent extends PlayerEvent {
    readonly blockState: BlockState;
}

/**
 * An inventory change. Java tests a single-item criterion against `changed`
 * alone and a multi-item one against the whole `inventory`, so both are here.
 */
export interface InventoryEvent extends PlayerEvent {
    /** Every slot in order, with an empty slot as undefined. */
    readonly inventory: readonly (ItemStack | undefined)[];
    /** The stack that changed, or undefined when the change emptied the slot. */
    readonly changed?: ItemStack;
}

/** A recipe the player unlocked. */
export interface RecipeEvent extends PlayerEvent {
    /** Namespaced recipe identifier. */
    readonly recipe: string;
}

/** A recipe the player or a crafter finished, with the stacks it consumed. */
export interface RecipeCraftedEvent extends RecipeEvent {
    readonly ingredients: readonly ItemStack[];
}

/** Damage the player took. */
export interface DamageEvent extends PlayerEvent {
    readonly damageSource: DamageSource;
    /** Damage before armor, resistance and enchantments reduced it. */
    readonly dealt: number;
    /** Damage that reached the health bar. */
    readonly taken: number;
    readonly blocked: boolean;
}

/** Damage the player dealt to another entity. */
export interface PlayerHurtEntityEvent extends DamageEvent {
    readonly entity: EntityView;
}

/** An event about one stack, such as the item a player ate. */
export interface ItemEvent extends PlayerEvent {
    readonly item: ItemStack;
}

/** An item that came out of an enchanting table. */
export interface EnchantedItemEvent extends ItemEvent {
    /** Experience levels the enchantment cost. */
    readonly levels: number;
}

/** A potion a brewing stand finished for the player. */
export interface BrewedPotionEvent extends PlayerEvent {
    /** The brewed stack, whose `minecraft:potion_contents` the `potion` field reads. */
    readonly potion: ItemStack;
}

/** A beacon the player completed. */
export interface BeaconEvent extends PlayerEvent {
    /** Number of complete pyramid layers under the beacon. */
    readonly level: number;
}

/** An eye of ender thrown toward a stronghold. */
export interface EnderEyeEvent extends PlayerEvent {
    /** Horizontal distance in blocks from the player to the stronghold. */
    readonly distance: number;
}

/** Two animals that bred. */
export interface BredAnimalsEvent extends PlayerEvent {
    readonly parent: EntityView;
    readonly partner: EntityView;
    /** Absent when the breeding produced no child, as mule breeding can. */
    readonly child?: EntityView;
}

/** A zombie villager a player cured. */
export interface CuredZombieVillagerEvent extends PlayerEvent {
    readonly zombie: EntityView;
    readonly villager: EntityView;
}

/** A villager trade the player completed. */
export interface VillagerTradeEvent extends PlayerEvent {
    readonly villager: EntityView;
    /** The stack the player received. */
    readonly item: ItemStack;
}

/** Durability a tool lost or regained. */
export interface ItemDurabilityEvent extends ItemEvent {
    /** Durability left after the change. */
    readonly durability: number;
    /** Durability lost, negative when the item was repaired. */
    readonly delta: number;
}

/** A player carried upward by levitation. */
export interface LevitationEvent extends PlayerEvent {
    /** Where the levitation started, which the `distance` field measures from. */
    readonly startPosition: Vec3;
    /** Remaining effect duration in ticks. */
    readonly duration: number;
}

/** A dimension change. */
export interface ChangedDimensionEvent extends PlayerEvent {
    /** Namespaced dimension identifier the player left. */
    readonly from: string;
    /** Namespaced dimension identifier the player arrived in. */
    readonly to: string;
}

/** An item used against a block, which is also how a placed block is reported. */
export interface ItemUsedOnBlockEvent extends PlayerEvent {
    readonly origin: Vec3;
    readonly blockState: BlockState;
    /** The stack in hand, which the `match_tool` condition reads. */
    readonly tool: ItemStack;
    readonly blockEntity?: BlockEntityView;
}

/** A block the player right-clicked, without the item in hand. */
export interface BlockInteractionEvent extends PlayerEvent {
    readonly origin: Vec3;
    readonly blockState: BlockState;
}

/** A change to the player's status effects. */
export interface EffectsChangedEvent extends PlayerEvent {
    /** The entity that applied the effect, such as the shooter of a tipped arrow. */
    readonly source?: EntityView;
}

/** Travel measured from where it started, for `nether_travel` and the two fall triggers. */
export interface TravelEvent extends PlayerEvent {
    readonly startPosition: Vec3;
}

/** A fall that an explosion started. */
export interface FallAfterExplosionEvent extends TravelEvent {
    readonly cause?: EntityView;
}

/** A fishing bobber that caught something. */
export interface FishingRodHookedEvent extends PlayerEvent {
    readonly rod: ItemStack;
    /** The hooked entity, absent when the bobber caught loot out of open water. */
    readonly entity?: EntityView;
    /** The stacks the catch produced. */
    readonly items: readonly ItemStack[];
}

/** Several entities hit at once, by a channeled lightning bolt or one arrow. */
export interface VictimsEvent extends PlayerEvent {
    readonly victims: readonly EntityView[];
}

/** Entities killed by one arrow. */
export interface KilledByArrowEvent extends VictimsEvent {
    readonly firedFromWeapon?: ItemStack;
}

/** Mobs a thrown trident pinned at once. */
export interface SpearMobsEvent extends PlayerEvent {
    readonly count: number;
}

/** A bee nest or beehive the player broke. */
export interface BeeNestDestroyedEvent extends PlayerEvent {
    readonly blockState: BlockState;
    /** The stack used to break it. */
    readonly item: ItemStack;
    readonly beesInside: number;
}

/** A target block a projectile hit. */
export interface TargetHitEvent extends PlayerEvent {
    /** Redstone signal the hit produced, 0 to 15. */
    readonly signalStrength: number;
    readonly projectile: EntityView;
}

/** A container whose loot the player generated. */
export interface ContainerLootEvent extends PlayerEvent {
    /** Namespaced loot table identifier. */
    readonly lootTable: string;
}

/** A thrown item picked up, raised for the thrower and for the receiver. */
export interface PickedUpItemEvent extends PlayerEvent {
    readonly item: ItemStack;
    /** The other party: the entity that picked the item up, or the one that threw it. */
    readonly entity?: EntityView;
}

/** A player interacting with an entity using the item in hand. */
export interface PlayerInteractEvent extends PlayerEvent {
    readonly item: ItemStack;
    readonly entity: EntityView;
}

/** A lightning bolt that struck near the player. */
export interface LightningStrikeEvent extends PlayerEvent {
    readonly lightning: EntityView;
    /** Every entity within range of the strike. */
    readonly bystanders: readonly EntityView[];
}

/**
 * The world-facing views a trigger needs while it evaluates its conditions.
 * Every member except the collector is optional and mirrors the matching seam
 * on `@jsprismarine/predicates`; a condition that reaches a view the host left
 * out reports a diagnostic and evaluates false.
 */
export interface EvaluationServices {
    readonly diagnostics: DiagnosticCollector;
    readonly level?: LevelView;
    readonly items?: ItemStackOps;
    readonly enchantments?: EnchantmentView;
    readonly content?: ContentView;
    readonly random?: RandomSource;
    /**
     * Memo for {@link entityContext}, which the engine refreshes for each
     * event it raises. One event reaches every criterion registered under its
     * trigger, and the biggest vanilla bucket holds 1914 of them, so building
     * the player's context once instead of once per criterion is the
     * difference the memo makes. Leave it out and each call builds a fresh
     * context.
     */
    readonly contexts?: Map<EntityView, PredicateContext>;
}

/**
 * Builds the `advancement_entity` context Java's `EntityPredicate.wrap` uses
 * for the `player` field and every other entity field on a trigger.
 */
export const entityContext = (entity: EntityView | undefined, services: EvaluationServices): PredicateContext => {
    const cached = entity && services.contexts?.get(entity);
    if (cached) return cached;

    const context = new PredicateContext({
        parameterSet: 'advancement_entity',
        parameters: { this_entity: entity, origin: entity?.position },
        diagnostics: services.diagnostics,
        level: services.level,
        items: services.items,
        enchantments: services.enchantments,
        content: services.content,
        random: services.random
    });
    if (entity) services.contexts?.set(entity, context);
    return context;
};

/** Builds the `advancement_location` context the `placed_block` family evaluates its `location` field in. */
export const locationContext = (event: ItemUsedOnBlockEvent, services: EvaluationServices): PredicateContext =>
    new PredicateContext({
        parameterSet: 'advancement_location',
        parameters: {
            this_entity: event.player,
            origin: event.origin,
            block_state: event.blockState,
            block_entity: event.blockEntity,
            tool: event.tool
        },
        diagnostics: services.diagnostics,
        level: services.level,
        items: services.items,
        enchantments: services.enchantments,
        content: services.content,
        random: services.random
    });

/** Builds the `block_use` context `default_block_use` and `any_block_use` evaluate their `location` field in. */
export const blockUseContext = (event: BlockInteractionEvent, services: EvaluationServices): PredicateContext =>
    new PredicateContext({
        parameterSet: 'block_use',
        parameters: { this_entity: event.player, origin: event.origin, block_state: event.blockState },
        diagnostics: services.diagnostics,
        level: services.level,
        items: services.items,
        enchantments: services.enchantments,
        content: services.content,
        random: services.random
    });
