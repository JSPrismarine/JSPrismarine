import type { PropertyValue } from './properties';

/**
 * What a filter reads. The grammar is one shared language, so the same context
 * serves entity definitions, spawn rules and trade tables; a caller fills in
 * the views it can answer and leaves the rest out.
 *
 * Every view member is optional and a missing one makes its tests evaluate to
 * false, which is what the engine does for a fact it cannot establish.
 */

/** The boolean facts about an entity, each named by the filter test that reads it. */
export const ENTITY_FLAGS = [
    'has_container_open',
    'has_nametag',
    'has_ranged_weapon',
    'has_silk_touch',
    'has_target',
    'has_trade_supply',
    'in_caravan',
    'in_clouds',
    'in_contact_with_water',
    'in_lava',
    'in_water',
    'in_water_or_rain',
    'is_avoiding_mobs',
    'is_baby',
    'is_bound_to_creaking_heart',
    'is_climbing',
    'is_humid',
    'is_immobile',
    'is_in_village',
    'is_leashed',
    'is_missing_health',
    'is_moving',
    'is_navigating',
    'is_panicking',
    'is_persistent',
    'is_raider',
    'is_riding',
    'is_sitting',
    'is_sleeping',
    'is_sneak_held',
    'is_sneaking',
    'is_snow_covered',
    'is_sprinting',
    'is_tamed',
    'is_underground',
    'is_underwater',
    'is_visible',
    'on_fire',
    'on_ground',
    'on_hot_block',
    'on_ladder',
    'surface_mob',
    'taking_fire_damage'
] as const;

/** One of {@link ENTITY_FLAGS}. */
export type EntityFlag = (typeof ENTITY_FLAGS)[number];

/** The numeric facts about an entity, each named by the filter test that reads it. */
export const ENTITY_MEASURES = [
    'actor_health',
    'distance_to_nearest_player',
    'home_distance',
    'inactivity_timer',
    'is_altitude',
    'is_brightness',
    'is_mark_variant',
    'is_skin_id',
    'is_temperature_value',
    'is_variant',
    'light_level',
    'owner_distance',
    'redstone_strength_at_position',
    'rider_count',
    'target_distance',
    'y_rotation'
] as const;

/** One of {@link ENTITY_MEASURES}. */
export type EntityMeasure = (typeof ENTITY_MEASURES)[number];

/** The name-set facts about an entity, each named by the filter test that reads it. */
export const ENTITY_NAME_SETS = [
    'has_ability',
    'has_biome_tag',
    'has_damage',
    'has_mob_effect',
    'has_tag',
    'in_block',
    'is_biome',
    'is_color',
    'is_controlling_passenger_family',
    'is_family',
    'is_temperature_type',
    'was_last_hurt_by',
    'weather_at_position'
] as const;

/** One of {@link ENTITY_NAME_SETS}. */
export type EntityNameSet = (typeof ENTITY_NAME_SETS)[number];

/** The equipment containers a filter `domain` names. */
export const EQUIPMENT_SLOTS = [
    'any',
    'armor',
    'feet',
    'hand',
    'head',
    'inventory',
    'leg',
    'main_hand',
    'off_hand',
    'torso'
] as const;

/** One of {@link EQUIPMENT_SLOTS}; `any` when a test's `domain` names none. */
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

/** One item stack, as the equipment and item tests read it. */
export interface FilterItemView {
    /** The item identifier, such as `minecraft:bucket`. */
    identifier(): string;
    /** The auxiliary value `has_equipment` compares after the `:` in its value. */
    data?(): number;
    tags?(): readonly string[];
    /** The level of the named enchantment, or 0 when the item does not carry it. */
    enchantment?(name: string): number;
    /** Whether the stack carries the named item component. */
    hasComponent?(name: string): boolean;
    /** Whether the stack has lost durability. */
    damaged?(): boolean;
}

/** One block, as `is_block` and `is_waterlogged` read it. */
export interface FilterBlockView {
    identifier(): string;
    waterlogged?(): boolean;
    tags?(): readonly string[];
}

/** How full one equipment container is. */
export interface SlotFill {
    /** How many slots of the container hold an item. */
    readonly filled: number;
    /** How many slots the container has. */
    readonly capacity: number;
}

/**
 * One entity a filter test can read, whether it is the subject or a related
 * entity the context reaches through {@link FilterEntityView.vehicle} and its
 * siblings.
 *
 * The position-dependent tests (`light_level`, `is_biome`, `is_underground`
 * and the rest) are answered here because the engine evaluates them at the
 * subject's position.
 */
export interface FilterEntityView {
    /** A stable identity, so the tests that compare two subjects can tell them apart. */
    id?(): string | number;
    /** A boolean fact, named by the filter test that reads it. */
    flag?(name: EntityFlag): boolean | undefined;
    /** A numeric fact, named by the filter test that reads it. */
    measure?(name: EntityMeasure): number | undefined;
    /** A set of names, such as the type families `is_family` compares against. */
    names?(name: EntityNameSet): readonly string[] | undefined;
    /** The current value of one entity property. */
    property?(name: string): PropertyValue | undefined;
    /** Whether the entity declares the named property at all. */
    hasProperty?(name: string): boolean;
    /** Whether the named component is active on the entity now. */
    hasComponent?(name: string): boolean;
    /** The item in one slot of a container, or undefined when the slot is empty. */
    equipment?(slot: EquipmentSlot, index: number): FilterItemView | undefined;
    /** How full a container is, for `all_slots_empty` and `any_slot_empty`. */
    slotFill?(slot: EquipmentSlot): SlotFill | undefined;
    /** Whether the entity carries any item answering the predicate, for the item tests. */
    carries?(matches: (item: FilterItemView) => boolean): boolean | undefined;
    /** The entity this one is riding. */
    vehicle?(): FilterEntityView | undefined;
    /** The entity that owns this one, for `is_owner`. */
    owner?(): FilterEntityView | undefined;
    /** This entity's current attack target, for `is_target`. */
    attackTarget?(): FilterEntityView | undefined;
    /** The entity holding this one's leash, for `is_leashed_to`. */
    leashHolder?(): FilterEntityView | undefined;
    /** Whether this entity trusts the other one. */
    trusts?(other: FilterEntityView): boolean | undefined;
}

/** The world facts the time, weather, difficulty and game rule tests read. */
export interface FilterWorldView {
    /** Time of day in ticks, in [0, 24000). */
    timeOfDay?(): number;
    /** The difficulty name, one of `peaceful`, `easy`, `normal` or `hard`. */
    difficulty?(): string;
    /** The dimension identifier, for `in_nether` and `in_overworld`. */
    dimension?(): string;
    /** A game rule's value, for `is_game_rule`. */
    gameRule?(name: string): boolean | number | undefined;
    /** The moon phase, 0 to 7. */
    moonPhase?(): number;
    /** The moon's brightness, in [0, 1]. */
    moonIntensity?(): number;
    /** The current weather name, one of `clear`, `precipitation`, `rain` or `thunder`. */
    weather?(): string;
}

/** Draws the random numbers `random_chance` and the event engine's `randomize` need. */
export interface RandomSource {
    /** The next value in [0, 1). */
    next(): number;
}

/** A random source backed by `Math.random`. */
export const defaultRandom: RandomSource = { next: () => Math.random() };

/**
 * Everything one filter evaluation can see. `self` is the only required
 * subject, because it is the default a test with no `subject` key reads.
 */
export interface FilterContext {
    readonly self: FilterEntityView;
    readonly other?: FilterEntityView;
    readonly player?: FilterEntityView;
    readonly target?: FilterEntityView;
    readonly parent?: FilterEntityView;
    readonly baby?: FilterEntityView;
    readonly damager?: FilterEntityView;
    readonly holder?: FilterEntityView;
    readonly item?: FilterItemView;
    readonly block?: FilterBlockView;
    readonly world?: FilterWorldView;
    readonly random?: RandomSource;
}
