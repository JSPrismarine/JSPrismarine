/**
 * The seam between an item behavior and the world it acts on.
 *
 * Everything in this package reaches the world through {@link WorldActions}
 * and nothing else, so the behavior families compile and test without the
 * server. The interface has nine required queries and one
 * {@link WorldActions.perform}; two optional capability queries let a host
 * decline an entity action before the item is consumed. World changes remain
 * variants of {@link ItemWorldAction} rather than new methods every adapter
 * has to grow.
 */
import type { BlockFace, BlockPosition, BlockReference, HolderSet, ItemSource, ItemStack } from '@jsprismarine/items';

export type { BlockFace, BlockPosition, BlockReference, HolderSet, ItemSource } from '@jsprismarine/items';

/** A block identifier with the state values it is placed with. */
export interface BlockPlacement {
    /** The Bedrock block identifier. */
    readonly identifier: string;
    /** The state values, keyed by Bedrock state name, empty for the default state. */
    readonly states: Readonly<Record<string, string | number | boolean>>;
}

/** One status effect as a behavior asks for it, in Java's own units. */
export interface EffectApplication {
    /** The effect identifier, such as `minecraft:regeneration`. */
    readonly id: string;
    /** How long it lasts, in ticks. */
    readonly durationTicks: number;
    /** The level above the first, so Regeneration II is amplifier 1. */
    readonly amplifier: number;
    /** Whether the client draws the icon. */
    readonly showIcon: boolean;
}

/** One status effect the source already has, which `can_always_eat` and the formulas read. */
export interface ActiveEffect {
    /** The effect identifier. */
    readonly id: string;
    /** The level above the first. */
    readonly amplifier: number;
}

/**
 * What a behavior needs to know about the entity using the item.
 *
 * One query rather than eight accessors, because every field is cheap for a
 * server that already has the entity and a behavior usually reads two of them.
 */
export interface SourceState {
    /** Where the source is. */
    readonly position: BlockPosition;
    /** Whether the source may use items without consuming them. */
    readonly creative: boolean;
    /** Whether the source is standing on something, which divides mining speed by five. */
    readonly onGround: boolean;
    /** Whether the source's eyes are in water, which scales mining speed. */
    readonly eyeInWater: boolean;
    /** Whether the source is gliding, which is what a firework rocket boosts. */
    readonly gliding: boolean;
    /** Whether the source is in water or rain, which is what Riptide needs. */
    readonly inWaterOrRain: boolean;
    /** How far the source has fallen, in blocks, which the mace scales its hit by. */
    readonly fallDistance: number;
    /** The status effects currently on the source. */
    readonly effects: readonly ActiveEffect[];
    /** The cooldown groups the source is currently waiting out. */
    readonly cooldownGroups: readonly string[];
    /** How full the source's hunger bar is, 0 to 20, which decides whether food is edible. */
    readonly foodLevel: number;
}

/** What a behavior needs to know about the world around the source. */
export interface EnvironmentState {
    /** The dimension identifier, such as `minecraft:overworld`. */
    readonly dimension: string;
    /** The time of day in ticks, 0 to 23999, which a clock reads. */
    readonly timeOfDay: number;
    /** The world spawn point, which a compass points at. */
    readonly spawnPosition: BlockPosition;
}

/** Which map operation a {@link MapAction} asks for. */
export type MapOperation = 'create' | 'clone' | 'extend' | 'lock';

/** Where an equipped item goes, named the way `minecraft:equippable` names it. */
export type EquipmentSlot =
    'any' | 'hand' | 'mainhand' | 'offhand' | 'armor' | 'head' | 'chest' | 'legs' | 'feet' | 'body' | 'saddle';

/** Put a block in the world, which is what a bucket, a fire starter and a tilled hoe all do. */
export interface PlaceBlockAction {
    readonly kind: 'place-block';
    readonly position: BlockPosition;
    readonly placement: BlockPlacement;
}

/** Take a block out of the world, which is how a bucket picks a fluid up. */
export interface BreakBlockAction {
    readonly kind: 'break-block';
    readonly position: BlockPosition;
}

/** Spawn an entity, from a spawn egg, a mob bucket, a boat or a firework rocket. */
export interface SpawnEntityAction {
    readonly kind: 'spawn-entity';
    readonly identifier: string;
    readonly position: BlockPosition;
    /** The entity's own stored data, such as a bucketed fish's variant. */
    readonly data?: Readonly<Record<string, unknown>>;
    /** The entity the spawned one rides or is attached to, for a rocket boosting a glider. */
    readonly attachedTo?: ItemSource;
}

/** Throw or shoot something, which covers arrows, snowballs, potions and tridents. */
export interface LaunchProjectileAction {
    readonly kind: 'launch-projectile';
    readonly identifier: string;
    readonly source: ItemSource;
    /** Launch speed in blocks per tick, as Java's `shootFromRotation` takes it. */
    readonly power: number;
    /** Spread in degrees; zero is dead on the view ray. */
    readonly inaccuracy: number;
    /** The projectile's own data, such as a tipped arrow's potion contents. */
    readonly data?: Readonly<Record<string, unknown>>;
}

/** Play a sound at a position. */
export interface PlaySoundAction {
    readonly kind: 'play-sound';
    readonly sound: string;
    readonly position: BlockPosition;
}

/** Give an entity status effects, which is the consumable effect path. */
export interface ApplyEffectsAction {
    readonly kind: 'apply-effects';
    readonly target: ItemSource;
    readonly effects: readonly EffectApplication[];
}

/** Take status effects off an entity. */
export interface RemoveEffectsAction {
    readonly kind: 'remove-effects';
    readonly target: ItemSource;
    /** Which effects to remove, or absent for every one of them, which is milk. */
    readonly effects?: HolderSet;
}

/** Hurt an entity, which an ender pearl does to its thrower. */
export interface DamageEntityAction {
    readonly kind: 'damage-entity';
    readonly target: ItemSource;
    readonly amount: number;
    readonly damageType: string;
}

/** Restore hunger and saturation, which is what eating is for. */
export interface FeedAction {
    readonly kind: 'feed';
    readonly target: ItemSource;
    /** Half-drumsticks restored, from `minecraft:food`. */
    readonly nutrition: number;
    /** Saturation restored, already the absolute figure Java stores. */
    readonly saturation: number;
}

/** Move an entity to a random nearby position, which is the chorus fruit. */
export interface TeleportRandomlyAction {
    readonly kind: 'teleport-randomly';
    readonly target: ItemSource;
    readonly radius: number;
}

/** Give experience, which is the experience bottle. */
export interface GrantExperienceAction {
    readonly kind: 'grant-experience';
    readonly target: ItemSource;
    readonly amount: number;
}

/** Start an item cooldown, keyed by the group `minecraft:use_cooldown` names. */
export interface StartCooldownAction {
    readonly kind: 'start-cooldown';
    readonly source: ItemSource;
    readonly group: string;
    readonly ticks: number;
}

/**
 * Spend durability.
 *
 * The amount has already been through `spendDurability`, so it accounts for
 * Unbreaking and for an item with no `minecraft:max_damage`. A zero amount is
 * never performed.
 */
export interface ConsumeDurabilityAction {
    readonly kind: 'consume-durability';
    readonly source: ItemSource;
    readonly amount: number;
    /** Whether that damage finished the item off. */
    readonly broke: boolean;
}

/** Put an item in the source's inventory, or drop it when there is no room. */
export interface GiveItemAction {
    readonly kind: 'give-item';
    readonly source: ItemSource;
    readonly item: ItemStack;
}

/** Put an item on an entity, which is armor, a saddle, a harness or horse armor. */
export interface EquipAction {
    readonly kind: 'equip';
    readonly target: ItemSource;
    readonly slot: EquipmentSlot;
    readonly item: ItemStack;
}

/** Name an entity, which is the name tag. */
export interface NameEntityAction {
    readonly kind: 'name-entity';
    readonly target: ItemSource;
    readonly name: string;
}

/** Tie a lead between two entities, or to a fence when the target is a knot. */
export interface AttachLeadAction {
    readonly kind: 'attach-lead';
    readonly source: ItemSource;
    readonly target: ItemSource;
}

/** Color an entity, which is a dye on a sheep, a collar or a harness. */
export interface DyeEntityAction {
    readonly kind: 'dye-entity';
    readonly target: ItemSource;
    readonly color: string;
}

/** Shear an entity, which is what shears do to a sheep or a snow golem. */
export interface ShearEntityAction {
    readonly kind: 'shear-entity';
    readonly target: ItemSource;
}

/** Bone meal a block, whose outcome the block family decides. */
export interface FertilizeAction {
    readonly kind: 'fertilize';
    readonly position: BlockPosition;
}

/** Set something on fire, which is flint and steel, a fire charge and Flame. */
export interface IgniteAction {
    readonly kind: 'ignite';
    readonly position: BlockPosition;
    readonly face: BlockFace;
}

/** Brush a block, which the brush does one step at a time. */
export interface BrushAction {
    readonly kind: 'brush';
    readonly source: ItemSource;
    readonly position: BlockPosition;
}

/** Raise or lower a shield. */
export interface BlockingAction {
    readonly kind: 'blocking';
    readonly source: ItemSource;
    /** Whether blocking starts or stops. */
    readonly active: boolean;
    /** How long before the block takes effect, in ticks. */
    readonly delayTicks: number;
}

/** Disable an entity's shield, which an axe hit does for five seconds. */
export interface DisableShieldAction {
    readonly kind: 'disable-shield';
    readonly target: ItemSource;
    readonly ticks: number;
}

/** Create, clone, extend or lock a map. */
export interface MapAction {
    readonly kind: 'map';
    readonly operation: MapOperation;
    readonly source: ItemSource;
    readonly item: ItemStack;
}

/** Find a structure, which is the eye of ender and an explorer map. */
export interface LocateAction {
    readonly kind: 'locate';
    readonly source: ItemSource;
    /** The structure tag to search, such as `minecraft:eye_of_ender_located`. */
    readonly destination: string;
}

/** Open a screen for the source, which is the book editor and the lectern. */
export interface OpenScreenAction {
    readonly kind: 'open-screen';
    readonly source: ItemSource;
    readonly screen: string;
    readonly item: ItemStack;
}

/** Cast or reel in a fishing line. */
export interface FishingAction {
    readonly kind: 'fishing';
    readonly source: ItemSource;
    /** Whether the line goes out or comes back. */
    readonly cast: boolean;
}

/** Everything a vanilla item behavior does to the world, as one tagged union. */
export type ItemWorldAction =
    | ApplyEffectsAction
    | AttachLeadAction
    | BlockingAction
    | BreakBlockAction
    | BrushAction
    | ConsumeDurabilityAction
    | DamageEntityAction
    | DisableShieldAction
    | DyeEntityAction
    | EquipAction
    | FeedAction
    | FertilizeAction
    | FishingAction
    | GiveItemAction
    | GrantExperienceAction
    | IgniteAction
    | LaunchProjectileAction
    | LocateAction
    | MapAction
    | NameEntityAction
    | OpenScreenAction
    | PlaceBlockAction
    | PlaySoundAction
    | RemoveEffectsAction
    | ShearEntityAction
    | SpawnEntityAction
    | StartCooldownAction
    | TeleportRandomlyAction;

/** Every `kind` {@link ItemWorldAction} can carry. */
export type ItemWorldActionKind = ItemWorldAction['kind'];

/** Narrows {@link ItemWorldAction} to the one variant with a given `kind`. */
export type ItemWorldActionOf<K extends ItemWorldActionKind> = Extract<ItemWorldAction, { kind: K }>;

/**
 * What an item behavior may ask of the world and do to it.
 *
 * The server implements this once. The queries are expected to be cheap and
 * synchronous: a behavior calls them while deciding, and the engine already
 * holds every answer by the time it dispatches a hook.
 */
export interface WorldActions {
    /** The block at a position, or undefined when the position is unloaded. */
    blockAt(position: BlockPosition): BlockReference | undefined;
    /**
     * A block's hardness, which is Java's `destroySpeed`.
     *
     * The number comes from the per-state property table rather than from
     * anything a pack publishes, so the world owns it. -1 means unbreakable,
     * and 0 means the block breaks instantly, which is why it costs a tool no
     * durability.
     */
    hardnessOf(block: BlockReference): number;
    /** Everything a behavior reads about the entity using the item. */
    stateOf(source: ItemSource): SourceState;
    /** Everything a behavior reads about the world around it. */
    environment(): EnvironmentState;
    /**
     * The entity an interaction landed on, or undefined when it landed on a
     * block or on nothing.
     *
     * The item hooks carry no entity-interaction hook, because Mojang's
     * `ItemCustomComponent` has none, so a behavior that acts on an entity
     * asks the world for the target instead.
     */
    targetOf(source: ItemSource): ItemSource | undefined;
    /**
     * Whether an identifier is in a holder set, which resolves the `#tag`,
     * single and list forms the same way for blocks, items and entities.
     */
    includes(set: HolderSet, member: string): boolean;
    /**
     * What a `minecraft:block_transformer` turns a block into: the axe's
     * stripping, the shovel's path and the hoe's tilling, all one data table.
     *
     * @returns The replacement, or undefined when the transformer has no rule
     *   for the block.
     */
    transform(transformer: string, block: BlockReference): BlockPlacement | undefined;
    /**
     * The effects one potion identifier applies.
     *
     * Java keeps its potion table in code rather than data, in `Potions`, so
     * the 47 entries cannot come from this package. The server, which already
     * builds a potion registry for the client, answers instead.
     *
     * @returns The effects, or an empty list for a water bottle and for a
     *   potion the server does not know.
     */
    effectsOf(potion: string): readonly EffectApplication[];
    /** A number in [0, 1), which is every random roll a behavior makes. */
    random(): number;
    /** Whether a target entity accepts a name tag, when the host can answer. */
    canNameEntity?(target: ItemSource): boolean;
    /** Whether a target entity accepts this dye, when the host can answer. */
    canDyeEntity?(target: ItemSource, color: string): boolean;
    /** Does one thing to the world. */
    perform(action: ItemWorldAction): void;
}
