import type { ComponentFactory } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';

import type { EntityInstance } from '../entityInstance';
import { splitSpawnReference } from '../eventEngine';
import { parseEventTarget } from '../events';
import { damagerSubjects } from '../filterContext';
import { evaluateFilter } from '../filters';
import type { EntityHooks } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import type { TriggerComponentParams } from '../triggers';
import type { ComponentRecord } from './schemas';
import {
    asList,
    attributeComponent,
    booleanAt,
    isRecord,
    numberAt,
    numberComponent,
    parseFilterValue,
    stringAt
} from './schemas';

/**
 * The entity components this package implements with behavior, as opposed to
 * the ones it parses and exposes for another system to read.
 *
 * The order here follows the coverage curve in the research note: the stats
 * every mob needs first, then the sensors and timers that drive events.
 */

/** The attribute components, each one number the server reads off the entity. */
export const attributeComponents: readonly ComponentFactory<
    EntityHooks,
    { readonly value: number; readonly max: number }
>[] = [
    attributeComponent('minecraft:health', 'health', 20),
    attributeComponent('minecraft:movement', 'movement', 0.25),
    attributeComponent('minecraft:underwater_movement', 'underwater_movement', 0.02),
    attributeComponent('minecraft:lava_movement', 'lava_movement', 0.02),
    attributeComponent('minecraft:flying_speed', 'flying_speed', 0.02),
    attributeComponent('minecraft:follow_range', 'follow_range', 16),
    attributeComponent('minecraft:knockback_resistance', 'knockback_resistance', 0),
    attributeComponent('minecraft:attack_damage', 'attack_damage', 1),
    attributeComponent('minecraft:horse.jump_strength', 'jump_strength', 0.7)
];

/** A damage amount, which vanilla writes as a number or a `{range_min, range_max}` object. */
export interface DamageRange {
    readonly min: number;
    readonly max: number;
}

const parseDamageRange = (value: unknown): DamageRange => {
    if (typeof value === 'number') return { min: value, max: value };
    if (isRecord(value)) {
        const min = numberAt(value, 'range_min', 0);
        return { min, max: numberAt(value, 'range_max', min) };
    }
    return { min: 0, max: 0 };
};

/** What `minecraft:attack` declares. */
export interface AttackParams {
    readonly damage: DamageRange;
    /** The status effect a hit applies, such as `poison`. */
    readonly effectName?: string;
    /** How long the effect lasts, in seconds. */
    readonly effectDuration: number;
}

/**
 * `minecraft:attack`, the melee damage an entity deals. It also declares the
 * `attack_damage` attribute, so a group that swaps the component changes the
 * stat.
 */
export const attack: ComponentFactory<EntityHooks, AttackParams> = {
    name: 'minecraft:attack',
    hooks: ['onInitialize'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        return accepted({
            damage: parseDamageRange(value.damage),
            effectName: stringAt(value, 'effect_name'),
            effectDuration: numberAt(value, 'effect_duration', 0)
        });
    },
    create: (params) => ({
        onInitialize: (entity) => {
            entity.attributes.define('attack_damage', { base: params.damage.min, max: params.damage.max });
        }
    })
};

/** What `minecraft:collision_box` declares, in blocks. */
export interface CollisionBoxParams {
    readonly width: number;
    readonly height: number;
}

/** `minecraft:collision_box`, the entity's hitbox. */
export const collisionBox: ComponentFactory<EntityHooks, CollisionBoxParams> = {
    name: 'minecraft:collision_box',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({ width: numberAt(value, 'width', 1), height: numberAt(value, 'height', 1) })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:type_family` declares. */
export interface TypeFamilyParams {
    /** The families `is_family` matches against. */
    readonly family: readonly string[];
}

/** `minecraft:type_family`, the families the most used filter test reads. */
export const typeFamily: ComponentFactory<EntityHooks, TypeFamilyParams> = {
    name: 'minecraft:type_family',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const family = asList(value.family).filter((name): name is string => typeof name === 'string');
        return accepted({ family });
    },
    create: () => ({})
};

/** What `minecraft:loot` declares. */
export interface LootParams {
    /** The pack-relative path of the loot table, such as `loot_tables/entities/zombie.json`. */
    readonly table?: string;
}

/** `minecraft:loot`, the table a later agent rolls on death. */
export const loot: ComponentFactory<EntityHooks, LootParams> = {
    name: 'minecraft:loot',
    hooks: [],
    schema: (value) =>
        isRecord(value) ? accepted({ table: stringAt(value, 'table') }) : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:experience_reward` declares; both fields are Molang expressions. */
export interface ExperienceRewardParams {
    readonly onDeath?: string;
    readonly onBred?: string;
}

/** `minecraft:experience_reward`, the experience an entity drops. */
export const experienceReward: ComponentFactory<EntityHooks, ExperienceRewardParams> = {
    name: 'minecraft:experience_reward',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({ onDeath: stringAt(value, 'on_death'), onBred: stringAt(value, 'on_bred') })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:physics` declares. */
export interface PhysicsParams {
    readonly hasGravity: boolean;
    readonly hasCollision: boolean;
    readonly pushTowardsClosestSpace: boolean;
}

/** `minecraft:physics`, carried by 126 of the 129 vanilla entities. */
export const physics: ComponentFactory<EntityHooks, PhysicsParams> = {
    name: 'minecraft:physics',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  hasGravity: booleanAt(value, 'has_gravity', true),
                  hasCollision: booleanAt(value, 'has_collision', true),
                  pushTowardsClosestSpace: booleanAt(value, 'push_towards_closest_space', false)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:breathable` declares. */
export interface BreathableParams {
    /** How many seconds of air the entity holds. */
    readonly totalSupply: number;
    /** How many seconds between suffocation ticks; -1 means the entity does not suffocate. */
    readonly suffocateTime: number;
    readonly breathesAir: boolean;
    readonly breathesWater: boolean;
    readonly breathesLava: boolean;
    readonly generatesBubbles: boolean;
    readonly inhaleTime: number;
}

/**
 * `minecraft:breathable`.
 *
 * Two vanilla files still write the pre-rename `totalSupply` and
 * `suffocateTime`, so both spellings read.
 */
export const breathable: ComponentFactory<EntityHooks, BreathableParams> = {
    name: 'minecraft:breathable',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const totalSupply = numberAt(value, 'total_supply', numberAt(value, 'totalSupply', 15));
        const suffocateTime = numberAt(value, 'suffocate_time', numberAt(value, 'suffocateTime', 0));
        return accepted({
            totalSupply,
            suffocateTime,
            breathesAir: booleanAt(value, 'breathes_air', true),
            breathesWater: booleanAt(value, 'breathes_water', false),
            breathesLava: booleanAt(value, 'breathes_lava', false),
            generatesBubbles: booleanAt(value, 'generates_bubbles', true),
            inhaleTime: numberAt(value, 'inhale_time', 0)
        });
    },
    create: () => ({})
};

/** What `minecraft:pushable` declares. */
export interface PushableParams {
    readonly isPushable: boolean;
    readonly isPushableByPiston: boolean;
}

/** `minecraft:pushable`, which the 1.26.50 component schema omits but 27 entities use. */
export const pushable: ComponentFactory<EntityHooks, PushableParams> = {
    name: 'minecraft:pushable',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  isPushable: booleanAt(value, 'is_pushable', true),
                  isPushableByPiston: booleanAt(value, 'is_pushable_by_piston', true)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:inventory` declares. */
export interface InventoryParams {
    readonly containerType: string;
    readonly inventorySize: number;
    readonly isPrivate: boolean;
    readonly restrictToOwner: boolean;
    readonly additionalSlotsPerStrength: number;
    readonly canBeSiphonedFrom: boolean;
}

/** `minecraft:inventory`, the container a mob carries. */
export const inventory: ComponentFactory<EntityHooks, InventoryParams> = {
    name: 'minecraft:inventory',
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  containerType: stringAt(value, 'container_type') ?? 'inventory',
                  inventorySize: numberAt(value, 'inventory_size', 5),
                  isPrivate: booleanAt(value, 'private', false),
                  restrictToOwner: booleanAt(value, 'restrict_to_owner', false),
                  additionalSlotsPerStrength: numberAt(value, 'additional_slots_per_strength', 0),
                  canBeSiphonedFrom: booleanAt(value, 'can_be_siphoned_from', false)
              })
            : rejected('expected an object'),
    create: () => ({})
};

/** One entry of `minecraft:equipment.slot_drop_chance`. */
export interface SlotDropChance {
    readonly slot: string;
    readonly dropChance: number;
}

/** What `minecraft:equipment` declares. */
export interface EquipmentParams {
    /** The loot table the entity equips from. */
    readonly table?: string;
    readonly slotDropChance: readonly SlotDropChance[];
}

/** `minecraft:equipment`, the loot table a mob wears. */
export const equipment: ComponentFactory<EntityHooks, EquipmentParams> = {
    name: 'minecraft:equipment',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const slotDropChance = asList(value.slot_drop_chance)
            .filter(isRecord)
            .map((entry) => ({
                slot: stringAt(entry, 'slot') ?? '',
                dropChance: numberAt(entry, 'drop_chance', 0)
            }));
        return accepted({ table: stringAt(value, 'table'), slotDropChance });
    },
    create: () => ({})
};

/** One seat of `minecraft:rideable`. */
export interface RideableSeat {
    readonly position: readonly [number, number, number];
    readonly minRiderCount: number;
    readonly maxRiderCount: number;
    readonly lockRiderRotation: number;
}

/** What `minecraft:rideable` declares. */
export interface RideableParams {
    readonly seatCount: number;
    /** Written as one object in 50 vanilla instances and an array in 17. */
    readonly seats: readonly RideableSeat[];
    /** The type families allowed to ride; empty means any. */
    readonly familyTypes: readonly string[];
    readonly interactText?: string;
    readonly crouchingSkipInteract: boolean;
    readonly pullInEntities: boolean;
    readonly onRiderEnterEvent?: string;
    readonly onRiderExitEvent?: string;
}

/** `minecraft:rideable`, the seats a passenger takes. */
export const rideable: ComponentFactory<EntityHooks, RideableParams> = {
    name: 'minecraft:rideable',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const seats = asList(value.seats)
            .filter(isRecord)
            .map((seat) => {
                const position = Array.isArray(seat.position)
                    ? seat.position.filter((part): part is number => typeof part === 'number')
                    : [];
                const minRiderCount = numberAt(seat, 'min_rider_count', 0);
                return {
                    position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0] as const,
                    minRiderCount,
                    maxRiderCount: numberAt(seat, 'max_rider_count', minRiderCount),
                    lockRiderRotation: numberAt(seat, 'lock_rider_rotation', 181)
                };
            });
        return accepted({
            seatCount: numberAt(value, 'seat_count', 1),
            seats,
            familyTypes: asList(value.family_types).filter((name): name is string => typeof name === 'string'),
            interactText: stringAt(value, 'interact_text'),
            crouchingSkipInteract: booleanAt(value, 'crouching_skip_interact', true),
            pullInEntities: booleanAt(value, 'pull_in_entities', false),
            onRiderEnterEvent: stringAt(value, 'on_rider_enter_event'),
            onRiderExitEvent: stringAt(value, 'on_rider_exit_event')
        });
    },
    create: () => ({})
};

/** What `minecraft:navigation.*` declares; every field is a capability of the path finder. */
export interface NavigationParams {
    /** The navigation flavor, such as `walk` or `generic`. */
    readonly kind: string;
    readonly canPathOverWater: boolean;
    readonly canPathOverLava: boolean;
    readonly canPathFromAir: boolean;
    readonly canFloat: boolean;
    readonly canSink: boolean;
    readonly canSwim: boolean;
    readonly canWalk: boolean;
    readonly canWalkInLava: boolean;
    readonly canFly: boolean;
    readonly canBreach: boolean;
    readonly canJump: boolean;
    readonly canOpenDoors: boolean;
    readonly canOpenIronDoors: boolean;
    readonly canPassDoors: boolean;
    readonly canBreakDoors: boolean;
    readonly usingDoorAnnotation: boolean;
    readonly avoidWater: boolean;
    readonly avoidSun: boolean;
    readonly avoidPortals: boolean;
    readonly avoidDamageBlocks: boolean;
    readonly isAmphibious: boolean;
    /** Block names and tags the path finder treats as impassable. */
    readonly blocksToAvoid: readonly unknown[];
}

/** Builds one `minecraft:navigation.<kind>` component. */
export const navigationComponent = (kind: string): ComponentFactory<EntityHooks, NavigationParams> => ({
    name: `minecraft:navigation.${kind}`,
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        return accepted({
            kind,
            canPathOverWater: booleanAt(value, 'can_path_over_water', false),
            canPathOverLava: booleanAt(value, 'can_path_over_lava', false),
            canPathFromAir: booleanAt(value, 'can_path_from_air', false),
            canFloat: booleanAt(value, 'can_float', false),
            canSink: booleanAt(value, 'can_sink', true),
            canSwim: booleanAt(value, 'can_swim', false),
            canWalk: booleanAt(value, 'can_walk', true),
            canWalkInLava: booleanAt(value, 'can_walk_in_lava', false),
            canFly: booleanAt(value, 'can_fly', false),
            canBreach: booleanAt(value, 'can_breach', false),
            canJump: booleanAt(value, 'can_jump', true),
            canOpenDoors: booleanAt(value, 'can_open_doors', false),
            canOpenIronDoors: booleanAt(value, 'can_open_iron_doors', false),
            canPassDoors: booleanAt(value, 'can_pass_doors', true),
            canBreakDoors: booleanAt(value, 'can_break_doors', false),
            usingDoorAnnotation: booleanAt(value, 'using_door_annotation', false),
            avoidWater: booleanAt(value, 'avoid_water', false),
            avoidSun: booleanAt(value, 'avoid_sun', false),
            avoidPortals: booleanAt(value, 'avoid_portals', false),
            avoidDamageBlocks: booleanAt(value, 'avoid_damage_blocks', false),
            isAmphibious: booleanAt(value, 'is_amphibious', false),
            blocksToAvoid: asList(value.blocks_to_avoid)
        });
    },
    create: () => ({})
});

/** What a `minecraft:movement.*` component declares. */
export interface MovementModeParams {
    /** The movement flavor, such as `basic` or `sway`. */
    readonly kind: string;
    /** The most degrees the entity turns per tick. */
    readonly maxTurn: number;
}

/** Builds one `minecraft:movement.<kind>` component. */
export const movementComponent = (
    kind: string,
    defaultMaxTurn = 30
): ComponentFactory<EntityHooks, MovementModeParams> => ({
    name: `minecraft:movement.${kind}`,
    hooks: [],
    schema: (value) =>
        isRecord(value)
            ? accepted({ kind, maxTurn: numberAt(value, 'max_turn', defaultMaxTurn) })
            : rejected('expected an object'),
    create: () => ({})
});

/** What `minecraft:jump.static` declares. */
export interface JumpParams {
    readonly jumpPower: number;
}

/** `minecraft:jump.static`, the fixed jump height 79 entities use. */
export const jumpStatic: ComponentFactory<EntityHooks, JumpParams> = {
    name: 'minecraft:jump.static',
    hooks: [],
    schema: (value) =>
        isRecord(value) ? accepted({ jumpPower: numberAt(value, 'jump_power', 0.42) }) : rejected('expected an object'),
    create: () => ({})
};

/** What `minecraft:despawn` declares. */
export interface DespawnParams {
    /** When set, the entity despawns as soon as the filters pass and the distance rules do not apply. */
    readonly filters?: Filter;
    readonly minDistance: number;
    readonly maxDistance: number;
    /** One in this many ticks, the entity beyond `minDistance` rolls to despawn. */
    readonly minRangeRandomChance: number;
    readonly removeChildEntities: boolean;
}

/**
 * `minecraft:despawn`, carried by 76 vanilla entities and written as the
 * empty default by 67 of them.
 *
 * With `filters`, the entity despawns as soon as they pass. Without them, the
 * standard rules apply: anything past `max_distance` goes at once, and
 * anything past `min_distance` rolls `min_range_random_chance` each tick.
 */
export const despawn: ComponentFactory<EntityHooks, DespawnParams> = {
    name: 'minecraft:despawn',
    hooks: ['onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const distance = isRecord(value.despawn_from_distance) ? value.despawn_from_distance : {};
        let filters: Filter | undefined;
        if (value.filters !== undefined) {
            const parsed = parseFilterValue(value.filters, 'minecraft:despawn filters');
            if (!parsed.ok) return parsed;
            filters = parsed.value;
        }
        return accepted({
            filters,
            minDistance: numberAt(distance, 'min_distance', 32),
            maxDistance: numberAt(distance, 'max_distance', 128),
            minRangeRandomChance: numberAt(value, 'min_range_random_chance', 800),
            removeChildEntities: booleanAt(value, 'remove_child_entities', false)
        });
    },
    create: (params) => ({
        onTick: (entity) => {
            if (params.filters !== undefined) {
                if (evaluateFilter(params.filters, entity.filterContext())) entity.remove('despawn filters passed');
                return;
            }
            const distance = entity.filterContext().self.measure?.('distance_to_nearest_player');
            if (distance === undefined) return;
            if (distance > params.maxDistance) {
                entity.remove('despawn beyond max_distance');
                return;
            }
            if (distance <= params.minDistance || params.minRangeRandomChance <= 0) return;
            if (entity.random.next() * params.minRangeRandomChance < 1)
                entity.remove('despawn roll beyond min_distance');
        }
    })
};

/** `minecraft:instant_despawn`, which removes the entity the moment it becomes active. */
export const instantDespawn: ComponentFactory<EntityHooks, ComponentRecord> = {
    name: 'minecraft:instant_despawn',
    hooks: ['onInitialize'],
    schema: (value) => (isRecord(value) ? accepted(value) : rejected('expected an object')),
    create: () => ({
        onInitialize: (entity) => entity.remove('minecraft:instant_despawn')
    })
};

/** One weighted entry of `minecraft:timer.random_time_choices`. */
export interface TimerChoice {
    readonly weight: number;
    readonly value: number;
}

/** What `minecraft:timer` declares. */
export interface TimerParams {
    /** How long the timer runs, in seconds, as a fixed value or a `[min, max]` pair. */
    readonly time: readonly [number, number];
    readonly looping: boolean;
    readonly randomInterval: boolean;
    /** Weighted durations the timer draws from instead of `time`. */
    readonly choices: readonly TimerChoice[];
    /** The event the timer fires when it runs out. */
    readonly event?: string;
}

interface TimerState {
    remaining: number;
}

const parseTimeRange = (value: unknown): readonly [number, number] => {
    if (typeof value === 'number') return [value, value];
    if (Array.isArray(value)) {
        const parts = value.filter((part): part is number => typeof part === 'number');
        return [parts[0] ?? 0, parts[1] ?? parts[0] ?? 0];
    }
    return [0, 0];
};

/**
 * `minecraft:timer`, which fires an event after a delay.
 *
 * Timing restarts on initialize, which is exactly the documented behavior of
 * re-adding a group: "an already-added `minecraft:timer` that is added again
 * will start its timing logic over".
 */
export const timer: ComponentFactory<EntityHooks, TimerParams> = {
    name: 'minecraft:timer',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const choices = asList(value.random_time_choices)
            .filter(isRecord)
            .map((choice) => ({ weight: numberAt(choice, 'weight', 1), value: numberAt(choice, 'value', 0) }));
        const event = isRecord(value.time_down_event) ? stringAt(value.time_down_event, 'event') : undefined;
        return accepted({
            time: parseTimeRange(value.time),
            looping: booleanAt(value, 'looping', true),
            randomInterval: booleanAt(value, 'randomInterval', true),
            choices,
            event
        });
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, TimerState>();
        const draw = (entity: EntityInstance): number => {
            if (params.choices.length > 0) {
                const total = params.choices.reduce((sum, choice) => sum + Math.max(0, choice.weight), 0);
                let roll = entity.random.next() * total;
                for (const choice of params.choices) {
                    roll -= Math.max(0, choice.weight);
                    if (roll < 0) return choice.value;
                }
                return params.choices[params.choices.length - 1]!.value;
            }
            const [min, max] = params.time;
            const seconds = params.randomInterval && max > min ? min + entity.random.next() * (max - min) : min;
            return seconds;
        };

        return {
            onInitialize: (entity) => {
                states.set(entity, { remaining: Math.round(draw(entity) * TICKS_PER_SECOND) });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;
                state.remaining -= 1;
                if (state.remaining > 0) return;
                if (params.event !== undefined) entity.fire(params.event);
                if (params.looping) state.remaining = Math.round(draw(entity) * TICKS_PER_SECOND);
                else states.delete(entity);
            }
        };
    }
};

/** One `{filters, event, target}` trigger, which five component bodies share. */
export interface SensorTrigger {
    readonly filters?: Filter;
    readonly event?: string;
    readonly target: string;
}

const parseSensorTriggers = (
    value: unknown,
    label: string
):
    | { readonly ok: true; readonly triggers: readonly SensorTrigger[] }
    | { readonly ok: false; readonly message: string } => {
    const triggers: SensorTrigger[] = [];
    for (const entry of asList(value)) {
        if (!isRecord(entry)) return { ok: false, message: `${label} entries must be objects` };
        let filters: Filter | undefined;
        if (entry.filters !== undefined) {
            const parsed = parseFilterValue(entry.filters, label);
            if (!parsed.ok) return { ok: false, message: parsed.message };
            filters = parsed.value;
        }
        triggers.push({ filters, event: stringAt(entry, 'event'), target: stringAt(entry, 'target') ?? 'self' });
    }
    return { ok: true, triggers };
};

/** What `minecraft:environment_sensor` declares. */
export interface EnvironmentSensorParams {
    readonly triggers: readonly SensorTrigger[];
}

/**
 * `minecraft:environment_sensor`, which tests the world each tick and fires an
 * event when its filters pass. The zombie's `is_underwater` trigger is what
 * starts the conversion to a drowned.
 */
export const environmentSensor: ComponentFactory<EntityHooks, EnvironmentSensorParams> = {
    name: 'minecraft:environment_sensor',
    hooks: ['onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const parsed = parseSensorTriggers(value.triggers, 'minecraft:environment_sensor triggers');
        if (!parsed.ok) return rejected(parsed.message);
        return accepted({ triggers: parsed.triggers });
    },
    create: (params) => ({
        onTick: (entity) => {
            const context = entity.filterContext();
            for (const trigger of params.triggers) {
                if (trigger.event === undefined) continue;
                if (trigger.filters !== undefined && !evaluateFilter(trigger.filters, context)) continue;
                entity.fire(trigger.event);
            }
        }
    })
};

/** How a `minecraft:damage_sensor` trigger changes the damage it sees. */
export const DEALS_DAMAGE = ['yes', 'no', 'no_but_side_effects_apply', 'no_but_entity_effects_apply'] as const;

/** One of {@link DEALS_DAMAGE}. */
export type DealsDamage = (typeof DEALS_DAMAGE)[number];

/** One `minecraft:damage_sensor` trigger. */
export interface DamageSensorTrigger {
    /** The damage cause it answers for, or `any`. */
    readonly cause: string;
    readonly dealsDamage: DealsDamage;
    readonly damageMultiplier: number;
    readonly filters?: Filter;
    readonly event?: string;
}

/** What `minecraft:damage_sensor` declares. */
export interface DamageSensorParams {
    readonly triggers: readonly DamageSensorTrigger[];
}

const parseDealsDamage = (value: unknown): DealsDamage => {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return DEALS_DAMAGE.find((name) => name === value) ?? 'yes';
};

/**
 * `minecraft:damage_sensor`, which decides what one damage cause does and
 * fires an event when it lands.
 *
 * The first trigger whose cause and filters match answers, which is why the
 * hook returns a value: `dispatchFirst` stops there.
 */
export const damageSensor: ComponentFactory<EntityHooks, DamageSensorParams> = {
    name: 'minecraft:damage_sensor',
    hooks: ['onDamage'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const triggers: DamageSensorTrigger[] = [];
        for (const entry of asList(value.triggers)) {
            if (!isRecord(entry)) return rejected('minecraft:damage_sensor triggers must be objects');
            const inner = isRecord(entry.on_damage) ? entry.on_damage : {};
            let filters: Filter | undefined;
            if (inner.filters !== undefined) {
                const parsed = parseFilterValue(inner.filters, 'minecraft:damage_sensor on_damage');
                if (!parsed.ok) return parsed;
                filters = parsed.value;
            }
            triggers.push({
                cause: stringAt(entry, 'cause') ?? 'any',
                dealsDamage: parseDealsDamage(entry.deals_damage),
                damageMultiplier: numberAt(entry, 'damage_multiplier', 1),
                filters,
                event: stringAt(inner, 'event')
            });
        }
        return accepted({ triggers });
    },
    create: (params) => ({
        onDamage: (entity, damage) => {
            const context = { ...entity.filterContext(), ...damagerSubjects(damage.damager) };
            for (const trigger of params.triggers) {
                if (trigger.cause !== 'any' && trigger.cause !== damage.cause) continue;
                if (trigger.filters !== undefined && !evaluateFilter(trigger.filters, context)) continue;
                const events = trigger.event === undefined ? [] : [trigger.event];
                for (const event of events) entity.fire(event);
                const amount = trigger.dealsDamage === 'yes' ? damage.amount * trigger.damageMultiplier : 0;
                return { amount, events };
            }
            return undefined;
        }
    })
};

/** What `minecraft:transformation` declares. */
export interface TransformationParams {
    /** The entity to become, in the `identifier<event>` form when it names an event. */
    readonly into: string;
    /** How long the change takes, in seconds. */
    readonly delay: number;
    readonly addGroups: readonly string[];
    readonly keepLevel: boolean;
    readonly keepOwner: boolean;
    readonly preserveEquipment: boolean;
    readonly dropEquipment: boolean;
    readonly dropInventory: boolean;
}

interface TransformState {
    remaining: number;
}

/**
 * `minecraft:transformation`, which replaces the entity with another type
 * after a delay and runs `minecraft:entity_transformed` on the new one.
 */
export const transformation: ComponentFactory<EntityHooks, TransformationParams> = {
    name: 'minecraft:transformation',
    hooks: ['onInitialize', 'onTick'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const into = stringAt(value, 'into');
        if (into === undefined) return rejected('minecraft:transformation needs an into');
        const delay =
            typeof value.delay === 'number'
                ? value.delay
                : numberAt(isRecord(value.delay) ? value.delay : {}, 'value', 0);
        const add = isRecord(value.add) ? value.add : {};
        return accepted({
            into,
            delay,
            addGroups: Array.isArray(add.component_groups)
                ? add.component_groups.filter((name): name is string => typeof name === 'string')
                : [],
            keepLevel: booleanAt(value, 'keep_level', false),
            keepOwner: booleanAt(value, 'keep_owner', false),
            preserveEquipment: booleanAt(value, 'preserve_equipment', false),
            dropEquipment: booleanAt(value, 'drop_equipment', false),
            dropInventory: booleanAt(value, 'drop_inventory', false)
        });
    },
    create: (params) => {
        const states = new WeakMap<EntityInstance, TransformState>();
        const target = splitSpawnReference(params.into);
        return {
            onInitialize: (entity) => {
                states.set(entity, { remaining: Math.round(params.delay * TICKS_PER_SECOND) });
            },
            onTick: (entity) => {
                const state = states.get(entity);
                if (state === undefined) return;
                if (state.remaining > 0) {
                    state.remaining -= 1;
                    return;
                }
                states.delete(entity);
                entity.transform({
                    identifier: target.identifier,
                    event: target.event,
                    addGroups: params.addGroups,
                    keepLevel: params.keepLevel,
                    keepOwner: params.keepOwner,
                    preserveEquipment: params.preserveEquipment,
                    dropEquipment: params.dropEquipment,
                    dropInventory: params.dropInventory
                });
            }
        };
    }
};

/**
 * Builds one of the eleven `minecraft:on_*` components.
 *
 * The component carries no hooks because it runs at a fixed point rather than
 * on a schedule of its own. {@link EntityInstance.trigger} reads the parsed
 * body back and fires it, which is what makes the component do something:
 * `minecraft:damage_sensor` and {@link EntityInstance.damage} reach the hurt
 * and death ones, and {@link EntityInstance.setAttackTarget} reaches the two
 * target ones.
 */
export const triggerComponent = (name: string): ComponentFactory<EntityHooks, TriggerComponentParams> => ({
    name,
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        let filters: Filter | undefined;
        if (value.filters !== undefined) {
            const parsed = parseFilterValue(value.filters, name);
            if (!parsed.ok) return parsed;
            filters = parsed.value;
        }
        const target = parseEventTarget(value.target, () => undefined);
        return accepted({ event: stringAt(value, 'event'), target, filters });
    },
    create: () => ({})
});

/** The three integer state components filters and the wire both read. */
export const integerStateComponents: readonly ComponentFactory<EntityHooks, number>[] = [
    numberComponent('minecraft:variant', 'value', 0),
    numberComponent('minecraft:mark_variant', 'value', 0),
    numberComponent('minecraft:skin_id', 'value', 0),
    numberComponent('minecraft:scale', 'value', 1),
    numberComponent('minecraft:color', 'value', 0),
    numberComponent('minecraft:color2', 'value', 0)
];
