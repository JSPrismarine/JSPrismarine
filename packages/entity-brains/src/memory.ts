/**
 * Memories: the brain's whole state model, and the one thing Bedrock's entity JSON has no
 * equivalent for.
 *
 * A memory is a typed slot holding an optional value with an optional expiry in ticks. Java
 * registers 115 of them in `minecraft:memory_module_type`; all 115 are here, with the registered
 * name and the Java value type of each read out of the pinned 26.3 server jar.
 */

import type { BlockPos, BrainEntity, BrainItemEntity, GlobalPos, PositionTracker, Vec3, WalkTarget } from './world.js';

/**
 * Java's `net.minecraft.util.Unit`: a value whose only content is its presence. Twenty memories
 * hold it, which is how the warden and the breeze store pure timers.
 */
export const UNIT = Symbol.for('@jsprismarine/entity-brains/unit');

/** The type of {@link UNIT}. */
export type Unit = typeof UNIT;

/**
 * A path as a brain stores it. Java keeps the whole `Path` in `MemoryModuleType.PATH`; a brain only
 * ever asks whether it reaches and where it ends, so that is all this carries.
 */
export interface BrainPath {
    readonly target: BlockPos;
    canReach(): boolean;
}

/** The part of Java's `DamageSource` that `HurtBySensor` and the panic behaviors read. */
export interface BrainDamageSource {
    /** The damage type id, such as `minecraft:lava`. */
    readonly type: string;
    /** Every damage type tag, such as `minecraft:panic_environmental_causes`. */
    readonly tags: ReadonlySet<string>;
    /** The entity that caused the damage, when there was one. */
    readonly entity?: BrainEntity;
}

/** Java's `SpearAttack.SpearStatus`, the piglin spear state machine. */
export type SpearStatus = 'charging' | 'engaging' | 'retreating';

/**
 * The visible slice of `NEAREST_LIVING_ENTITIES`, Java's `NearestVisibleLivingEntities`.
 *
 * Java computes line of sight once per scan and caches it, so a behavior that asks for the closest
 * entity matching a predicate pays for the predicate and not for the ray cast.
 */
export interface NearestVisibleLivingEntities {
    /** The nearest entity satisfying the predicate, nearest first. */
    findClosest(predicate: (entity: BrainEntity) => boolean): BrainEntity | undefined;
    /** Every visible entity satisfying the predicate, nearest first. */
    findAll(predicate: (entity: BrainEntity) => boolean): readonly BrainEntity[];
    /** Whether the entity is in the visible set. */
    contains(entity: BrainEntity): boolean;
}

/** An empty {@link NearestVisibleLivingEntities}, Java's `NearestVisibleLivingEntities.empty()`. */
export const NO_VISIBLE_ENTITIES: NearestVisibleLivingEntities = {
    findClosest: () => undefined,
    findAll: () => [],
    contains: () => false
};

/** Builds a {@link NearestVisibleLivingEntities} over an already-sorted, already-visible list. */
export function visibleEntities(entities: readonly BrainEntity[]): NearestVisibleLivingEntities {
    return {
        findClosest: (predicate) => entities.find(predicate),
        findAll: (predicate) => entities.filter(predicate),
        contains: (entity) => entities.includes(entity)
    };
}

/**
 * A memory module type. The type parameter is the value the slot holds and is carried by
 * {@link MemoryModuleType.valueType}, a declaration-only marker that never exists at runtime.
 */
export interface MemoryModuleType<Value> {
    /** The registered name without its namespace, such as `attack_target`. */
    readonly name: string;
    /** Declaration-only: carries {@link MemoryModuleType}'s value type. Always `undefined`. */
    readonly valueType?: Value;
}

function memory<Value>(name: string): MemoryModuleType<Value> {
    return { name };
}

/**
 * Java's `MemoryStatus`, the three ways a behavior or an activity can depend on a memory.
 *
 * - `value_present`: registered and holding a value.
 * - `value_absent`: registered and empty.
 * - `registered`: registered, value or not. A behavior that writes a memory asks for this so the
 *   brain allocates the slot without requiring it to be filled first.
 */
export type MemoryStatus = 'value_present' | 'value_absent' | 'registered';

/**
 * One memory's storage. Java's `MemorySlot`.
 *
 * `timeToLive` counts down one per brain tick while a value is present. `Long.MAX_VALUE` means
 * never expire, which is what {@link MemorySlot.set} without a time to live stores.
 */
export class MemorySlot<Value> {
    /** Java's `MemorySlot.NEVER_EXPIRE`, `Long.MAX_VALUE`. */
    public static readonly NEVER_EXPIRE = Number.MAX_SAFE_INTEGER;

    private storedValue: Value | undefined = undefined;
    private remaining: number = MemorySlot.NEVER_EXPIRE;

    /**
     * Ages the slot by one tick.
     *
     * Java checks expiry before decrementing, so a slot set with a time to live of `n` is readable
     * on `n` ticks and is cleared on the `n + 1`th.
     */
    public tick(): void {
        if (this.hasValue() && this.canExpire()) {
            if (this.hasExpired()) {
                this.clear();
            } else {
                this.remaining--;
            }
        }
    }

    /** Stores a value, with an expiry in ticks when one is given. */
    public set(value: Value, timeToLive: number = MemorySlot.NEVER_EXPIRE): void {
        this.storedValue = value;
        this.remaining = timeToLive;
    }

    /** Empties the slot and resets its expiry. */
    public clear(): void {
        this.storedValue = undefined;
        this.remaining = MemorySlot.NEVER_EXPIRE;
    }

    /** Whether the slot holds a value right now. */
    public hasValue(): boolean {
        return this.storedValue !== undefined;
    }

    /** The stored value, or undefined while the slot is empty. */
    public value(): Value | undefined {
        return this.storedValue;
    }

    /** Whether the slot was given a time to live rather than stored forever. */
    public canExpire(): boolean {
        return this.remaining !== MemorySlot.NEVER_EXPIRE;
    }

    /** Whether the countdown has run out. {@link MemorySlot.tick} clears the slot on the next tick. */
    public hasExpired(): boolean {
        return this.remaining <= 0;
    }

    /** Ticks left before the slot clears, or {@link MemorySlot.NEVER_EXPIRE}. */
    public timeToLive(): number {
        return this.remaining;
    }
}

/**
 * The 115 entries of `minecraft:memory_module_type` in the 26.3 server jar, in registration order.
 *
 * The field names are Java's field names, which differ from the registered names in six places:
 * `NEAREST_LIVING_ENTITIES` registers as `mobs`, `NEAREST_VISIBLE_LIVING_ENTITIES` as
 * `visible_mobs`, `NEAREST_VISIBLE_ATTACKABLE_PLAYER(S)` as `nearest_visible_targetable_player(s)`,
 * `LONG_JUMP_COOLDOWN_TICKS` as `long_jump_cooling_down`, `BREEZE_SHOOT_RECOVERING` as
 * `breeze_shoot_recover`, and `LIKED_NOTEBLOCK_POSITION` as `liked_noteblock`.
 */
export const MemoryModuleTypes = {
    /** `minecraft:dummy`, Java `Void`. */
    DUMMY: memory<never>('dummy'),
    /** `minecraft:home`, Java `GlobalPos`. */
    HOME: memory<GlobalPos>('home'),
    /** `minecraft:job_site`, Java `GlobalPos`. */
    JOB_SITE: memory<GlobalPos>('job_site'),
    /** `minecraft:potential_job_site`, Java `GlobalPos`. */
    POTENTIAL_JOB_SITE: memory<GlobalPos>('potential_job_site'),
    /** `minecraft:meeting_point`, Java `GlobalPos`. */
    MEETING_POINT: memory<GlobalPos>('meeting_point'),
    /** `minecraft:secondary_job_site`, Java `List<GlobalPos>`. */
    SECONDARY_JOB_SITE: memory<readonly GlobalPos[]>('secondary_job_site'),
    /** `minecraft:mobs`, Java `List<LivingEntity>`. */
    NEAREST_LIVING_ENTITIES: memory<readonly BrainEntity[]>('mobs'),
    /** `minecraft:visible_mobs`, Java `NearestVisibleLivingEntities`. */
    NEAREST_VISIBLE_LIVING_ENTITIES: memory<NearestVisibleLivingEntities>('visible_mobs'),
    /** `minecraft:visible_villager_babies`, Java `List<LivingEntity>`. */
    VISIBLE_VILLAGER_BABIES: memory<readonly BrainEntity[]>('visible_villager_babies'),
    /** `minecraft:nearest_players`, Java `List<Player>`. */
    NEAREST_PLAYERS: memory<readonly BrainEntity[]>('nearest_players'),
    /** `minecraft:nearest_visible_player`, Java `Player`. */
    NEAREST_VISIBLE_PLAYER: memory<BrainEntity>('nearest_visible_player'),
    /** `minecraft:nearest_visible_targetable_player`, Java `Player`. */
    NEAREST_VISIBLE_ATTACKABLE_PLAYER: memory<BrainEntity>('nearest_visible_targetable_player'),
    /** `minecraft:nearest_visible_targetable_players`, Java `List<Player>`. */
    NEAREST_VISIBLE_ATTACKABLE_PLAYERS: memory<readonly BrainEntity[]>('nearest_visible_targetable_players'),
    /** `minecraft:walk_target`, Java `WalkTarget`. */
    WALK_TARGET: memory<WalkTarget>('walk_target'),
    /** `minecraft:look_target`, Java `PositionTracker`. */
    LOOK_TARGET: memory<PositionTracker>('look_target'),
    /** `minecraft:attack_target`, Java `LivingEntity`. */
    ATTACK_TARGET: memory<BrainEntity>('attack_target'),
    /** `minecraft:attack_cooling_down`, Java `Boolean`. */
    ATTACK_COOLING_DOWN: memory<boolean>('attack_cooling_down'),
    /** `minecraft:interaction_target`, Java `LivingEntity`. */
    INTERACTION_TARGET: memory<BrainEntity>('interaction_target'),
    /** `minecraft:breed_target`, Java `AgeableMob`. */
    BREED_TARGET: memory<BrainEntity>('breed_target'),
    /** `minecraft:ride_target`, Java `Entity`. */
    RIDE_TARGET: memory<BrainEntity>('ride_target'),
    /** `minecraft:path`, Java `Path`. */
    PATH: memory<BrainPath>('path'),
    /** `minecraft:doors_to_close`, Java `Set<GlobalPos>`. */
    DOORS_TO_CLOSE: memory<readonly GlobalPos[]>('doors_to_close'),
    /** `minecraft:nearest_bed`, Java `BlockPos`. */
    NEAREST_BED: memory<BlockPos>('nearest_bed'),
    /** `minecraft:hurt_by`, Java `DamageSource`. */
    HURT_BY: memory<BrainDamageSource>('hurt_by'),
    /** `minecraft:hurt_by_entity`, Java `LivingEntity`. */
    HURT_BY_ENTITY: memory<BrainEntity>('hurt_by_entity'),
    /** `minecraft:avoid_target`, Java `LivingEntity`. */
    AVOID_TARGET: memory<BrainEntity>('avoid_target'),
    /** `minecraft:nearest_hostile`, Java `LivingEntity`. */
    NEAREST_HOSTILE: memory<BrainEntity>('nearest_hostile'),
    /** `minecraft:nearest_attackable`, Java `LivingEntity`. */
    NEAREST_ATTACKABLE: memory<BrainEntity>('nearest_attackable'),
    /** `minecraft:hiding_place`, Java `GlobalPos`. */
    HIDING_PLACE: memory<GlobalPos>('hiding_place'),
    /** `minecraft:heard_bell_time`, Java `Long`. */
    HEARD_BELL_TIME: memory<number>('heard_bell_time'),
    /** `minecraft:cant_reach_walk_target_since`, Java `Long`. */
    CANT_REACH_WALK_TARGET_SINCE: memory<number>('cant_reach_walk_target_since'),
    /** `minecraft:golem_detected_recently`, Java `Boolean`. */
    GOLEM_DETECTED_RECENTLY: memory<boolean>('golem_detected_recently'),
    /** `minecraft:danger_detected_recently`, Java `Boolean`. */
    DANGER_DETECTED_RECENTLY: memory<boolean>('danger_detected_recently'),
    /** `minecraft:last_slept`, Java `Long`. */
    LAST_SLEPT: memory<number>('last_slept'),
    /** `minecraft:last_woken`, Java `Long`. */
    LAST_WOKEN: memory<number>('last_woken'),
    /** `minecraft:last_worked_at_poi`, Java `Long`. */
    LAST_WORKED_AT_POI: memory<number>('last_worked_at_poi'),
    /** `minecraft:nearest_visible_adult`, Java `LivingEntity`. */
    NEAREST_VISIBLE_ADULT: memory<BrainEntity>('nearest_visible_adult'),
    /** `minecraft:nearest_visible_wanted_item`, Java `ItemEntity`. */
    NEAREST_VISIBLE_WANTED_ITEM: memory<BrainItemEntity>('nearest_visible_wanted_item'),
    /** `minecraft:nearest_visible_nemesis`, Java `Mob`. */
    NEAREST_VISIBLE_NEMESIS: memory<BrainEntity>('nearest_visible_nemesis'),
    /** `minecraft:play_dead_ticks`, Java `Integer`. */
    PLAY_DEAD_TICKS: memory<number>('play_dead_ticks'),
    /** `minecraft:tempting_player`, Java `Player`. */
    TEMPTING_PLAYER: memory<BrainEntity>('tempting_player'),
    /** `minecraft:temptation_cooldown_ticks`, Java `Integer`. */
    TEMPTATION_COOLDOWN_TICKS: memory<number>('temptation_cooldown_ticks'),
    /** `minecraft:gaze_cooldown_ticks`, Java `Integer`. */
    GAZE_COOLDOWN_TICKS: memory<number>('gaze_cooldown_ticks'),
    /** `minecraft:long_jump_cooling_down`, Java `Integer`. */
    LONG_JUMP_COOLDOWN_TICKS: memory<number>('long_jump_cooling_down'),
    /** `minecraft:long_jump_mid_jump`, Java `Boolean`. */
    LONG_JUMP_MID_JUMP: memory<boolean>('long_jump_mid_jump'),
    /** `minecraft:has_hunting_cooldown`, Java `Boolean`. */
    HAS_HUNTING_COOLDOWN: memory<boolean>('has_hunting_cooldown'),
    /** `minecraft:ram_cooldown_ticks`, Java `Integer`. */
    RAM_COOLDOWN_TICKS: memory<number>('ram_cooldown_ticks'),
    /** `minecraft:ram_target`, Java `Vec3`. */
    RAM_TARGET: memory<Vec3>('ram_target'),
    /** `minecraft:is_in_water`, Java `Unit`. */
    IS_IN_WATER: memory<Unit>('is_in_water'),
    /** `minecraft:is_pregnant`, Java `Unit`. */
    IS_PREGNANT: memory<Unit>('is_pregnant'),
    /** `minecraft:is_panicking`, Java `Boolean`. */
    IS_PANICKING: memory<boolean>('is_panicking'),
    /** `minecraft:unreachable_tongue_targets`, Java `List<UUID>`. */
    UNREACHABLE_TONGUE_TARGETS: memory<readonly string[]>('unreachable_tongue_targets'),
    /** `minecraft:visited_block_positions`, Java `Set<GlobalPos>`. */
    VISITED_BLOCK_POSITIONS: memory<readonly GlobalPos[]>('visited_block_positions'),
    /** `minecraft:unreachable_transport_block_positions`, Java `Set<GlobalPos>`. */
    UNREACHABLE_TRANSPORT_BLOCK_POSITIONS: memory<readonly GlobalPos[]>('unreachable_transport_block_positions'),
    /** `minecraft:transport_items_cooldown_ticks`, Java `Integer`. */
    TRANSPORT_ITEMS_COOLDOWN_TICKS: memory<number>('transport_items_cooldown_ticks'),
    /** `minecraft:charge_cooldown_ticks`, Java `Integer`. */
    CHARGE_COOLDOWN_TICKS: memory<number>('charge_cooldown_ticks'),
    /** `minecraft:attack_target_cooldown`, Java `Integer`. */
    ATTACK_TARGET_COOLDOWN: memory<number>('attack_target_cooldown'),
    /** `minecraft:spear_fleeing_time`, Java `Integer`. */
    SPEAR_FLEEING_TIME: memory<number>('spear_fleeing_time'),
    /** `minecraft:spear_fleeing_position`, Java `Vec3`. */
    SPEAR_FLEEING_POSITION: memory<Vec3>('spear_fleeing_position'),
    /** `minecraft:spear_charge_position`, Java `Vec3`. */
    SPEAR_CHARGE_POSITION: memory<Vec3>('spear_charge_position'),
    /** `minecraft:spear_engage_time`, Java `Integer`. */
    SPEAR_ENGAGE_TIME: memory<number>('spear_engage_time'),
    /** `minecraft:spear_status`, Java `SpearAttack$SpearStatus`. */
    SPEAR_STATUS: memory<SpearStatus>('spear_status'),
    /** `minecraft:angry_at`, Java `UUID`. */
    ANGRY_AT: memory<string>('angry_at'),
    /** `minecraft:universal_anger`, Java `Boolean`. */
    UNIVERSAL_ANGER: memory<boolean>('universal_anger'),
    /** `minecraft:admiring_item`, Java `Boolean`. */
    ADMIRING_ITEM: memory<boolean>('admiring_item'),
    /** `minecraft:time_trying_to_reach_admire_item`, Java `Integer`. */
    TIME_TRYING_TO_REACH_ADMIRE_ITEM: memory<number>('time_trying_to_reach_admire_item'),
    /** `minecraft:disable_walk_to_admire_item`, Java `Boolean`. */
    DISABLE_WALK_TO_ADMIRE_ITEM: memory<boolean>('disable_walk_to_admire_item'),
    /** `minecraft:admiring_disabled`, Java `Boolean`. */
    ADMIRING_DISABLED: memory<boolean>('admiring_disabled'),
    /** `minecraft:hunted_recently`, Java `Boolean`. */
    HUNTED_RECENTLY: memory<boolean>('hunted_recently'),
    /** `minecraft:celebrate_location`, Java `BlockPos`. */
    CELEBRATE_LOCATION: memory<BlockPos>('celebrate_location'),
    /** `minecraft:dancing`, Java `Boolean`. */
    DANCING: memory<boolean>('dancing'),
    /** `minecraft:nearest_visible_huntable_hoglin`, Java `Hoglin`. */
    NEAREST_VISIBLE_HUNTABLE_HOGLIN: memory<BrainEntity>('nearest_visible_huntable_hoglin'),
    /** `minecraft:nearest_visible_baby_hoglin`, Java `Hoglin`. */
    NEAREST_VISIBLE_BABY_HOGLIN: memory<BrainEntity>('nearest_visible_baby_hoglin'),
    /** `minecraft:nearest_targetable_player_not_wearing_gold`, Java `Player`. */
    NEAREST_TARGETABLE_PLAYER_NOT_WEARING_GOLD: memory<BrainEntity>('nearest_targetable_player_not_wearing_gold'),
    /** `minecraft:nearby_adult_piglins`, Java `List<AbstractPiglin>`. */
    NEARBY_ADULT_PIGLINS: memory<readonly BrainEntity[]>('nearby_adult_piglins'),
    /** `minecraft:nearest_visible_adult_piglins`, Java `List<AbstractPiglin>`. */
    NEAREST_VISIBLE_ADULT_PIGLINS: memory<readonly BrainEntity[]>('nearest_visible_adult_piglins'),
    /** `minecraft:nearest_visible_adult_hoglins`, Java `List<Hoglin>`. */
    NEAREST_VISIBLE_ADULT_HOGLINS: memory<readonly BrainEntity[]>('nearest_visible_adult_hoglins'),
    /** `minecraft:nearest_visible_adult_piglin`, Java `AbstractPiglin`. */
    NEAREST_VISIBLE_ADULT_PIGLIN: memory<BrainEntity>('nearest_visible_adult_piglin'),
    /** `minecraft:nearest_visible_zombified`, Java `LivingEntity`. */
    NEAREST_VISIBLE_ZOMBIFIED: memory<BrainEntity>('nearest_visible_zombified'),
    /** `minecraft:visible_adult_piglin_count`, Java `Integer`. */
    VISIBLE_ADULT_PIGLIN_COUNT: memory<number>('visible_adult_piglin_count'),
    /** `minecraft:visible_adult_hoglin_count`, Java `Integer`. */
    VISIBLE_ADULT_HOGLIN_COUNT: memory<number>('visible_adult_hoglin_count'),
    /** `minecraft:nearest_player_holding_wanted_item`, Java `Player`. */
    NEAREST_PLAYER_HOLDING_WANTED_ITEM: memory<BrainEntity>('nearest_player_holding_wanted_item'),
    /** `minecraft:ate_recently`, Java `Boolean`. */
    ATE_RECENTLY: memory<boolean>('ate_recently'),
    /** `minecraft:nearest_repellent`, Java `BlockPos`. */
    NEAREST_REPELLENT: memory<BlockPos>('nearest_repellent'),
    /** `minecraft:pacified`, Java `Boolean`. */
    PACIFIED: memory<boolean>('pacified'),
    /** `minecraft:roar_target`, Java `LivingEntity`. */
    ROAR_TARGET: memory<BrainEntity>('roar_target'),
    /** `minecraft:disturbance_location`, Java `BlockPos`. */
    DISTURBANCE_LOCATION: memory<BlockPos>('disturbance_location'),
    /** `minecraft:recent_projectile`, Java `Unit`. */
    RECENT_PROJECTILE: memory<Unit>('recent_projectile'),
    /** `minecraft:is_sniffing`, Java `Unit`. */
    IS_SNIFFING: memory<Unit>('is_sniffing'),
    /** `minecraft:is_emerging`, Java `Unit`. */
    IS_EMERGING: memory<Unit>('is_emerging'),
    /** `minecraft:roar_sound_delay`, Java `Unit`. */
    ROAR_SOUND_DELAY: memory<Unit>('roar_sound_delay'),
    /** `minecraft:dig_cooldown`, Java `Unit`. */
    DIG_COOLDOWN: memory<Unit>('dig_cooldown'),
    /** `minecraft:roar_sound_cooldown`, Java `Unit`. */
    ROAR_SOUND_COOLDOWN: memory<Unit>('roar_sound_cooldown'),
    /** `minecraft:sniff_cooldown`, Java `Unit`. */
    SNIFF_COOLDOWN: memory<Unit>('sniff_cooldown'),
    /** `minecraft:touch_cooldown`, Java `Unit`. */
    TOUCH_COOLDOWN: memory<Unit>('touch_cooldown'),
    /** `minecraft:vibration_cooldown`, Java `Unit`. */
    VIBRATION_COOLDOWN: memory<Unit>('vibration_cooldown'),
    /** `minecraft:sonic_boom_cooldown`, Java `Unit`. */
    SONIC_BOOM_COOLDOWN: memory<Unit>('sonic_boom_cooldown'),
    /** `minecraft:sonic_boom_sound_cooldown`, Java `Unit`. */
    SONIC_BOOM_SOUND_COOLDOWN: memory<Unit>('sonic_boom_sound_cooldown'),
    /** `minecraft:sonic_boom_sound_delay`, Java `Unit`. */
    SONIC_BOOM_SOUND_DELAY: memory<Unit>('sonic_boom_sound_delay'),
    /** `minecraft:liked_player`, Java `UUID`. */
    LIKED_PLAYER: memory<string>('liked_player'),
    /** `minecraft:liked_noteblock`, Java `GlobalPos`. */
    LIKED_NOTEBLOCK_POSITION: memory<GlobalPos>('liked_noteblock'),
    /** `minecraft:liked_noteblock_cooldown_ticks`, Java `Integer`. */
    LIKED_NOTEBLOCK_COOLDOWN_TICKS: memory<number>('liked_noteblock_cooldown_ticks'),
    /** `minecraft:item_pickup_cooldown_ticks`, Java `Integer`. */
    ITEM_PICKUP_COOLDOWN_TICKS: memory<number>('item_pickup_cooldown_ticks'),
    /** `minecraft:sniffer_explored_positions`, Java `List<GlobalPos>`. */
    SNIFFER_EXPLORED_POSITIONS: memory<readonly GlobalPos[]>('sniffer_explored_positions'),
    /** `minecraft:sniffer_sniffing_target`, Java `BlockPos`. */
    SNIFFER_SNIFFING_TARGET: memory<BlockPos>('sniffer_sniffing_target'),
    /** `minecraft:sniffer_digging`, Java `Boolean`. */
    SNIFFER_DIGGING: memory<boolean>('sniffer_digging'),
    /** `minecraft:sniffer_happy`, Java `Boolean`. */
    SNIFFER_HAPPY: memory<boolean>('sniffer_happy'),
    /** `minecraft:breeze_jump_cooldown`, Java `Unit`. */
    BREEZE_JUMP_COOLDOWN: memory<Unit>('breeze_jump_cooldown'),
    /** `minecraft:breeze_shoot`, Java `Unit`. */
    BREEZE_SHOOT: memory<Unit>('breeze_shoot'),
    /** `minecraft:breeze_shoot_charging`, Java `Unit`. */
    BREEZE_SHOOT_CHARGING: memory<Unit>('breeze_shoot_charging'),
    /** `minecraft:breeze_shoot_recover`, Java `Unit`. */
    BREEZE_SHOOT_RECOVERING: memory<Unit>('breeze_shoot_recover'),
    /** `minecraft:breeze_shoot_cooldown`, Java `Unit`. */
    BREEZE_SHOOT_COOLDOWN: memory<Unit>('breeze_shoot_cooldown'),
    /** `minecraft:breeze_jump_inhaling`, Java `Unit`. */
    BREEZE_JUMP_INHALING: memory<Unit>('breeze_jump_inhaling'),
    /** `minecraft:breeze_jump_target`, Java `BlockPos`. */
    BREEZE_JUMP_TARGET: memory<BlockPos>('breeze_jump_target'),
    /** `minecraft:breeze_leaving_water`, Java `Unit`. */
    BREEZE_LEAVING_WATER: memory<Unit>('breeze_leaving_water')
} as const;

/** Every registered memory module type, in registration order. */
export const ALL_MEMORY_MODULE_TYPES: readonly MemoryModuleType<unknown>[] = Object.values(MemoryModuleTypes);
