import type { ItemStack } from './item';

/** A position in world space. */
export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** A block state as Java names it: a block identifier plus its property values as strings. */
export interface BlockState {
    readonly name: string;
    readonly properties?: Readonly<Record<string, string>>;
}

/** A fluid state, shaped like {@link BlockState} because Java's `fluid` sub-predicate reads the same way. */
export interface FluidState {
    readonly name: string;
    readonly properties?: Readonly<Record<string, string>>;
}

/** The block entity behind the `block_entity` context parameter. */
export interface BlockEntityView {
    readonly id: string;
    /** Parsed NBT, in whatever shape the host uses; this package only compares it by identity. */
    readonly nbt?: unknown;
}

/** One status effect on an entity. */
export interface EffectInstance {
    readonly amplifier: number;
    /** Remaining duration in ticks. */
    readonly duration: number;
    readonly ambient: boolean;
    readonly visible: boolean;
}

/** Every slot Java's `equipment` entity sub-predicate can name. */
export const EQUIPMENT_SLOTS = ['mainhand', 'offhand', 'head', 'chest', 'legs', 'feet', 'body', 'saddle'] as const;

/** One of {@link EQUIPMENT_SLOTS}. */
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/** Every flag Java's `flags` entity sub-predicate can test. */
export const ENTITY_FLAGS = [
    'is_on_fire',
    'is_sneaking',
    'is_sprinting',
    'is_swimming',
    'is_baby',
    'is_flying',
    'is_on_ground',
    'is_in_water',
    'is_fall_flying'
] as const;

/** One of {@link ENTITY_FLAGS}. */
export type EntityFlag = (typeof ENTITY_FLAGS)[number];

/** The entity speed and offset the `movement` entity sub-predicate reads. */
export interface MovementView {
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
    readonly speed?: number;
    readonly horizontalSpeed?: number;
    readonly verticalSpeed?: number;
    readonly fallDistance?: number;
}

/**
 * Everything the entity sub-predicates can ask about one entity. Every member
 * is optional: a host fills in what it can answer, and a sub-predicate that
 * reaches a member the host left out reports a diagnostic and fails.
 */
export interface EntityView {
    /** Namespaced entity type identifier, for example `minecraft:sheep`. */
    readonly type: string;
    /** Entity type tags this entity belongs to, namespaced and without the leading `#`. */
    readonly typeTags?: readonly string[];
    readonly position?: Vec3;
    readonly flags?: Readonly<Partial<Record<EntityFlag, boolean>>>;
    /** Data components on the entity, keyed by namespaced component type. */
    readonly components?: ReadonlyMap<string, unknown>;
    /** Active status effects, keyed by namespaced effect identifier. */
    readonly effects?: ReadonlyMap<string, EffectInstance>;
    readonly equipment?: Readonly<Partial<Record<EquipmentSlot, ItemStack>>>;
    readonly vehicle?: EntityView;
    readonly passenger?: EntityView;
    /** The entity this one is attacking, read by the `targeted_entity` sub-predicate. */
    readonly target?: EntityView;
    /** The entity a player is looking at, read by `type_specific/player`. */
    readonly lookingAt?: EntityView;
    readonly team?: string;
    /** Scoreboard values, keyed by objective name. */
    readonly scores?: ReadonlyMap<string, number>;
    /** The block under the entity's feet, read by `stepping_on`. */
    readonly steppingOn?: BlockState;
    /** The block the entity's movement is affected by, read by `movement_affected_by`. */
    readonly movementAffectedBy?: BlockState;
    readonly movement?: MovementView;
    /** Age in ticks, read by `periodic_tick`. */
    readonly ticksExisted?: number;
    /** Experience level, read by `type_specific/player`. */
    readonly experienceLevel?: number;
    /** Game mode identifier, read by `type_specific/player`. */
    readonly gameMode?: string;
    /** Whether the entity is a captain of a raid, whether a sheep is sheared, and the rest of the per-type flags. */
    readonly typeSpecific?: Readonly<Record<string, unknown>>;
    /** Parsed NBT for the `nbt` sub-predicate, in whatever shape the host uses. */
    readonly nbt?: unknown;
}

/** The damage source behind the `damage_source` context parameter. */
export interface DamageSource {
    /** Namespaced damage type identifier, for example `minecraft:arrow`. */
    readonly type: string;
    /** Damage type tags, namespaced and without the leading `#`. */
    readonly tags?: readonly string[];
    /** The projectile or other entity that landed the hit. */
    readonly directEntity?: EntityView;
    /** The entity that caused the hit, which is the shooter for a projectile. */
    readonly sourceEntity?: EntityView;
    readonly position?: Vec3;
}

/**
 * The world state the location, weather and time conditions read. Implement
 * what the host can answer; a predicate that reaches an unimplemented member
 * reports a diagnostic and evaluates false, which keeps a partial host usable
 * instead of forcing a stub for every method.
 */
export interface LevelView {
    /** Total ticks on a world clock, for example `minecraft:overworld`, before the `time_check` period is applied. */
    clockTicks?(clock: string): number;
    isRaining?(): boolean;
    isThundering?(): boolean;
    /** Namespaced dimension identifier of the level being evaluated. */
    dimension?(): string;
    blockAt?(position: Vec3): BlockState | undefined;
    fluidAt?(position: Vec3): FluidState | undefined;
    /** Namespaced biome identifier at a position. */
    biomeAt?(position: Vec3): string | undefined;
    /** Biome tags the biome at a position belongs to, namespaced and without the leading `#`. */
    biomeTagsAt?(position: Vec3): readonly string[];
    /** Namespaced identifiers of the structures whose bounding box contains a position. */
    structuresAt?(position: Vec3): readonly string[];
    /** Combined light level at a position, which is what Java's `light` predicate compares. */
    lightAt?(position: Vec3): number;
    canSeeSky?(position: Vec3): boolean;
    /** Whether a campfire below the position is producing smoke. */
    isSmokey?(position: Vec3): boolean;
    /** Value of an environment attribute at a position, for `environment_attribute` providers and checks. */
    environmentAttribute?(attribute: string, position: Vec3 | undefined): number | undefined;
    /** Value stored under a path in a command storage namespace, for `storage` providers. */
    storedNumber?(storage: string, path: string): number | undefined;
    /** Scoreboard value for a holder name and objective, for `score` providers. */
    score?(holder: string, objective: string): number | undefined;
}
