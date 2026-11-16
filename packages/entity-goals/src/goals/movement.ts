import type { EntityPosition, Goal } from '@jsprismarine/entities';
import { isBribed, spendBribe } from '@jsprismarine/entities/components/bribeable';
import { buckMount } from '@jsprismarine/entities/components/tamemount';
import type { Filter } from '@jsprismarine/packs';
import { AIR_STATE } from '@jsprismarine/entities/components/hazards';

import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import { blockOf, centerOf } from '../navigation/view';
import type { GoalBody, GoalEvent, Range, TargetEntityType } from '../params';
import {
    bodySchema,
    booleanAt,
    entityTypesAt,
    eventAt,
    eventsAt,
    filterAt,
    numberAt,
    rangeAt,
    stringAt,
    stringsAt,
    tickRangeAt,
    ticksAt
} from '../params';
import { targetFamilies } from '../support';
import type { GoalSupport } from '../support';
import type { GoalMob } from '../world';

/**
 * The goals that move the entity: wandering, swimming, flying, fleeing,
 * following and walking to a found position.
 *
 * They all hold the `move` flag, so the scheduler runs one at a time and the
 * priority in the entity file decides which. Every one of them walks through
 * {@link GoalSupport.navigator}, which paths with the A* finder when the
 * server supplies a navigation view and falls back to `EntityActuator.moveTo`
 * when it does not.
 */

/** How often a wandering goal looks for somewhere to go, from Java's `RandomStrollGoal.DEFAULT_INTERVAL`. */
const STROLL_INTERVAL = 120;

/** How far a flee draws its destination, from Java's `AvoidEntityGoal`. */
const FLEE_XZ_DISTANCE = 16;

/** Within this many blocks of its threat a fleeing entity sprints, from Java's `AvoidEntityGoal.tick` (49 squared). */
const AVOID_SPRINT_DISTANCE = 7;

/** How far up and down a flee draws its destination, from Java's `AvoidEntityGoal`. */
const FLEE_Y_DISTANCE = 7;

/**
 * The damage that makes an entity panic when its `minecraft:behavior.panic` names no
 * `damage_sources`: Bedrock's documented default list. Like Java's `panic_causes` damage type tag
 * it holds fire, freezing, lightning, attacks, explosions and projectiles and leaves out a fall,
 * drowning and suffocation.
 */
const PANIC_DAMAGE_SOURCES: readonly string[] = [
    'campfire',
    'fire',
    'fire_tick',
    'freezing',
    'lava',
    'lightning',
    'magma',
    'soul_campfire',
    'temperature',
    'entity_attack',
    'entity_explosion',
    'fireworks',
    'magic',
    'projectile',
    'ram_attack',
    'sonic_boom',
    'wither',
    'mace_smash'
];

/** How close counts as arriving when a goal names no radius, in blocks. */
const DEFAULT_GOAL_RADIUS = 1;

/** Java stops starting stroll goals after this many ticks without a nearby player. */
const RANDOM_STROLL_NO_ACTION_TIME = 100;

/** The shape every "pick a spot and walk there" goal takes. */
interface WalkOptions {
    /** Picks the destination, or returns undefined when there is nowhere to go. */
    find(): EntityPosition | undefined;
    readonly speedMultiplier: number;
    /** One tick in this many starts a walk; 0 starts one whenever the goal is free. */
    readonly interval: number;
    /** How close counts as arriving, in blocks. */
    readonly goalRadius: number;
    /** Whether the Java goal updates between selector runs. */
    readonly requiresUpdateEveryTick?: boolean;
    /** Checks Java preconditions before a start-interval random draw. */
    canStart?(): boolean;
    /** Runs when the entity arrives. */
    onArrive?(): void;
}

/** The shared walk loop: draw a destination on the interval, then walk to it. */
const walkTo = (support: GoalSupport, options: WalkOptions): Goal => {
    let destination: EntityPosition | undefined;
    let walking = false;

    return {
        canStart: () => {
            if (options.canStart?.() === false) return false;
            if (options.interval > 0) {
                // Goal.reducedTickDelay halves delays for goals that only update on selector ticks.
                const interval = options.requiresUpdateEveryTick ? options.interval : Math.ceil(options.interval / 2);
                if (support.randomInt(interval) !== 0) return false;
            }
            destination = options.find();
            return destination !== undefined;
        },
        canContinue: () => walking,
        start: () => {
            walking =
                destination !== undefined &&
                support.navigator.moveTo(destination, options.speedMultiplier, options.goalRadius);
        },
        tick: () => {
            if (support.navigator.tick()) return;
            walking = false;
            options.onArrive?.();
        },
        stop: () => {
            walking = false;
            destination = undefined;
            support.navigator.stop();
        },
        requiresUpdateEveryTick: () => options.requiresUpdateEveryTick === true
    };
};

/** What the wandering goals declare. */
export interface WanderParams {
    readonly speedMultiplier: number;
    /** How far the destination may be horizontally, in blocks. */
    readonly xzDistance: number;
    /** How far it may be vertically, in blocks. */
    readonly yDistance: number;
    /** One tick in this many starts a walk. */
    readonly interval: number;
}

const wanderFrom = (body: GoalBody, defaults: Partial<WanderParams> = {}): WanderParams => ({
    speedMultiplier: numberAt(body, 'speed_multiplier', defaults.speedMultiplier ?? 1),
    xzDistance: numberAt(body, 'xz_dist', defaults.xzDistance ?? 10),
    yDistance: numberAt(body, 'y_dist', defaults.yDistance ?? 7),
    interval: numberAt(body, 'interval', defaults.interval ?? STROLL_INTERVAL)
});

/**
 * `minecraft:behavior.random_stroll`, the wander 64 vanilla entities carry.
 *
 * Java's `RandomStrollGoal` draws a reachable position within 10 blocks
 * horizontally and 7 vertically and tries one tick in 120, which is the
 * `DEFAULT_INTERVAL` constant.
 */
export const randomStroll = goal<WanderParams>({
    name: 'minecraft:behavior.random_stroll',
    controlFlags: ['move'],
    schema: bodySchema((body) => wanderFrom(body)),
    create: (params, support) =>
        walkTo(support, {
            find: () => support.navigator.randomTarget(params.xzDistance, params.yDistance, () => support.random()),
            // Java checks this before drawing RandomStrollGoal's start interval.
            canStart: () => support.noActionTime() < RANDOM_STROLL_NO_ACTION_TIME,
            speedMultiplier: params.speedMultiplier,
            interval: params.interval,
            goalRadius: DEFAULT_GOAL_RADIUS
        })
});

/**
 * `minecraft:behavior.random_swim`, the wander the 12 water mobs carry. It is
 * `random_stroll` with a wider default box and an `avoid_surface` flag that
 * keeps the destination under water.
 */
export const randomSwim = goal<WanderParams & { readonly avoidSurface: boolean }>({
    name: 'minecraft:behavior.random_swim',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        ...wanderFrom(body, { xzDistance: 16, yDistance: 4, interval: 120 }),
        avoidSurface: booleanAt(body, 'avoid_surface', true)
    })),
    create: (params, support) =>
        walkTo(support, {
            find: () => {
                const candidate = support.navigator.randomTarget(params.xzDistance, params.yDistance, () =>
                    support.random()
                );
                if (candidate === undefined || !params.avoidSurface) return candidate;
                const view = support.navigation();
                if (view === undefined) return candidate;
                return view.isWater(candidate) ? candidate : undefined;
            },
            canStart: () => support.noActionTime() < RANDOM_STROLL_NO_ACTION_TIME && support.canRandomSwim(),
            speedMultiplier: params.speedMultiplier,
            interval: params.interval,
            goalRadius: DEFAULT_GOAL_RADIUS
        })
});

/**
 * `minecraft:behavior.random_fly`, which the parrot carries. The destination
 * is drawn in three dimensions, so the entity needs a flying navigation
 * component for the path finder to reach it.
 */
export const randomFly = goal<WanderParams & { readonly canLandOnTrees: boolean; readonly yOffset: number }>({
    name: 'minecraft:behavior.random_fly',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        ...wanderFrom(body, { xzDistance: 10, yDistance: 7, interval: 120 }),
        canLandOnTrees: booleanAt(body, 'can_land_on_trees', true),
        yOffset: numberAt(body, 'y_offset', 0)
    })),
    create: (params, support) =>
        walkTo(support, {
            find: () => {
                const candidate = support.navigator.randomTarget(params.xzDistance, params.yDistance, () =>
                    support.random()
                );
                return candidate === undefined ? undefined : { ...candidate, y: candidate.y + params.yOffset };
            },
            speedMultiplier: params.speedMultiplier,
            interval: params.interval,
            goalRadius: DEFAULT_GOAL_RADIUS
        })
});

/**
 * The y of the first open block above the ground under a position: the solid block the
 * position is inside, or the first one below it within `reach`. Undefined over a drop deeper
 * than that.
 */
const surfaceUnder = (support: GoalSupport, position: EntityPosition, reach: number): number | undefined => {
    const view = support.navigation();
    if (view === undefined) return undefined;
    const cell = blockOf(position);
    if (view.isSolid(cell)) {
        let y = cell.y + 1;
        while (y - cell.y <= reach && view.isSolid({ ...cell, y })) y += 1;
        return y - cell.y <= reach ? y : undefined;
    }
    for (let y = cell.y - 1; cell.y - y <= reach; y -= 1) if (view.isSolid({ ...cell, y })) return y + 1;
    return undefined;
};

/**
 * `minecraft:behavior.random_hover`, which the bee and the allay carry. It is
 * the flying wander with the destination's height pinned to a band above the
 * ground: `hover_height` blocks above the surface under the drawn spot, as
 * Java's `HoverRandomPos` moves a drawn solid block up to 1 to 3 blocks over
 * it. A spot over a drop deeper than the vertical range is no destination.
 */
export const randomHover = goal<WanderParams & { readonly hoverHeight: Range; readonly yOffset: number }>({
    name: 'minecraft:behavior.random_hover',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        ...wanderFrom(body, { xzDistance: 10, yDistance: 7, interval: 120 }),
        hoverHeight: rangeAt(body, 'hover_height', [0, 0]),
        yOffset: numberAt(body, 'y_offset', 0)
    })),
    create: (params, support) =>
        walkTo(support, {
            find: () => {
                const candidate = support.navigator.randomTarget(params.xzDistance, params.yDistance, () =>
                    support.random()
                );
                if (candidate === undefined) return undefined;
                const hover = support.between(params.hoverHeight[0], params.hoverHeight[1]);
                const surface = surfaceUnder(support, candidate, params.yDistance + hover);
                if (surface === undefined && support.navigation() !== undefined) return undefined;
                return { ...candidate, y: (surface ?? candidate.y) + hover + params.yOffset };
            },
            speedMultiplier: params.speedMultiplier,
            interval: params.interval,
            goalRadius: DEFAULT_GOAL_RADIUS
        })
});

/** What `minecraft:behavior.float_wander` declares. */
export interface FloatWanderParams extends WanderParams {
    /** How long one drift lasts, in ticks. */
    readonly floatDuration: Range;
    /** Whether a new destination is drawn before the old one is reached. */
    readonly randomReselect: boolean;
    /** Whether the goal steers the entity itself rather than through the move control. */
    readonly hasMoveControl: boolean;
    /** Whether the destination has to be reachable. */
    readonly mustReach: boolean;
    /** Whether the drift stays inside the entity's home radius. */
    readonly useHomePositionRestriction: boolean;
    /** How high above the drawn position the entity floats, in blocks. */
    readonly yOffset: number;
}

/**
 * `minecraft:behavior.float_wander`, which the ghast, the blaze and the vex
 * carry. The entity drifts to a point in the air for a drawn time rather than
 * walking a path to it.
 */
export const floatWander = goal<FloatWanderParams>({
    name: 'minecraft:behavior.float_wander',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        ...wanderFrom(body, { xzDistance: 10, yDistance: 7, interval: 120 }),
        floatDuration: tickRangeAt(body, 'float_duration', [0, 0]),
        randomReselect: booleanAt(body, 'random_reselect', false),
        hasMoveControl: booleanAt(body, 'float_wander_has_move_control', true),
        mustReach: booleanAt(body, 'must_reach', false),
        useHomePositionRestriction: booleanAt(body, 'use_home_position_restriction', false),
        yOffset: numberAt(body, 'y_offset', 0)
    })),
    create: (params, support) => {
        let remaining = 0;
        const walk = walkTo(support, {
            find: () => {
                const candidate = support.navigator.randomTarget(params.xzDistance, params.yDistance, () =>
                    support.random()
                );
                if (candidate === undefined) return undefined;
                return { ...candidate, y: candidate.y + params.yOffset };
            },
            speedMultiplier: params.speedMultiplier,
            interval: params.interval,
            goalRadius: DEFAULT_GOAL_RADIUS
        });

        return {
            ...walk,
            canContinue: () => remaining > 0 && (walk.canContinue?.() ?? true),
            start: () => {
                remaining = support.between(params.floatDuration[0], params.floatDuration[1]) || 1;
                walk.start?.();
            },
            tick: () => {
                remaining -= 1;
                walk.tick?.();
            },
            stop: () => {
                remaining = 0;
                walk.stop?.();
            }
        };
    }
});

/** What `minecraft:behavior.swim_wander` declares. */
export interface SwimWanderParams {
    readonly speedMultiplier: number;
    /** One tick in this many starts a drift. */
    readonly interval: number;
    /** How far ahead the entity aims, in blocks. */
    readonly lookAhead: number;
    /** How long one drift lasts, in ticks. */
    readonly wanderTime: number;
}

/**
 * `minecraft:behavior.swim_wander`, which the six fish carry. A fish has no
 * path to follow, so the goal aims it a short way ahead and lets it drift.
 */
export const swimWander = goal<SwimWanderParams>({
    name: 'minecraft:behavior.swim_wander',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        interval: Math.max(1, Math.round(numberAt(body, 'interval', 0.1) * 10)),
        lookAhead: numberAt(body, 'look_ahead', 5),
        wanderTime: ticksAt(body, 'wander_time', 5)
    })),
    create: (params, support) => {
        let remaining = 0;
        return {
            canStart: () => support.flag('in_water') && support.canRandomSwim() && support.chance(1 / params.interval),
            canContinue: () => remaining > 0 && support.flag('in_water'),
            start: () => {
                remaining = params.wanderTime;
                const here = support.position();
                const angle = support.random() * Math.PI * 2;
                support.navigator.moveTo(
                    {
                        x: here.x + Math.cos(angle) * params.lookAhead,
                        y: here.y + (support.random() - 0.5) * params.lookAhead,
                        z: here.z + Math.sin(angle) * params.lookAhead
                    },
                    params.speedMultiplier,
                    DEFAULT_GOAL_RADIUS
                );
            },
            tick: () => {
                remaining -= 1;
                support.navigator.tick();
            },
            stop: () => {
                remaining = 0;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.swim_idle` declares. */
export interface SwimIdleParams {
    /** How long the entity hangs still, in ticks. */
    readonly idleTime: number;
    /** The chance per tick of going idle, in [0, 1]. */
    readonly successRate: number;
}

/**
 * `minecraft:behavior.swim_idle`, which the six fish carry. It is the pause
 * between drifts, and it only runs out of water for the fish that beached
 * themselves.
 */
export const swimIdle = goal<SwimIdleParams>({
    name: 'minecraft:behavior.swim_idle',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        idleTime: ticksAt(body, 'idle_time', 5),
        successRate: numberAt(body, 'success_rate', 0.1)
    })),
    create: (params, support) => {
        let remaining = 0;
        return {
            canStart: () => !support.flag('in_water') && support.chance(params.successRate),
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.idleTime;
                support.navigator.stop();
            },
            tick: () => {
                remaining -= 1;
            },
            stop: () => {
                remaining = 0;
            }
        };
    }
});

/**
 * `minecraft:behavior.float`, which keeps an entity at the surface of water or
 * lava. 49 vanilla entities carry it, 40 of them at priority 0.
 *
 * Java's `FloatGoal` jumps on a 0.8 chance per tick while the entity is in a
 * fluid deeper than its jump threshold, which is where the default comes from.
 */
export const float = goal<{ readonly chancePerTickToFloat: number; readonly dismountTime: number }>({
    name: 'minecraft:behavior.float',
    controlFlags: ['jump'],
    schema: bodySchema((body) => ({
        chancePerTickToFloat: numberAt(body, 'chance_per_tick_to_float', 0.8),
        dismountTime: ticksAt(body, 'time_under_water_to_dismount_passengers', 0)
    })),
    create: (params, support) => ({
        canStart: () => support.flag('in_water') || support.flag('in_lava'),
        tick: () => {
            if (support.chance(params.chancePerTickToFloat)) support.actuator?.jump();
        },
        requiresUpdateEveryTick: () => true
    })
});

/**
 * `minecraft:behavior.slime_float`, which the slime line carries. A slime
 * steers while it bobs, so the goal takes `move` as well as `jump`.
 */
export const slimeFloat = goal<{ readonly jumpChance: number; readonly speedMultiplier: number }>({
    name: 'minecraft:behavior.slime_float',
    controlFlags: ['move', 'jump'],
    schema: bodySchema((body) => ({
        jumpChance: numberAt(body, 'jump_chance_percentage', 0.8),
        speedMultiplier: numberAt(body, 'speed_multiplier', 1.2)
    })),
    create: (params, support) => ({
        canStart: () => support.flag('in_water') || support.flag('in_lava'),
        tick: () => {
            if (support.chance(params.jumpChance)) support.actuator?.jump();
        }
    })
});

/**
 * `minecraft:behavior.rise_to_liquid_level`, which the strider carries. In a liquid the entity
 * floats up until it stands `liquid_y_offset` into the top liquid block, and sinks back when it
 * is above that, as Java's `Strider.floatStrider` lifts a strider 0.05 a tick until it stands on
 * the lava's surface.
 */
export const riseToLiquidLevel = goal<{
    readonly liquidYOffset: number;
    readonly riseDelta: number;
    readonly sinkDelta: number;
}>({
    name: 'minecraft:behavior.rise_to_liquid_level',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        liquidYOffset: numberAt(body, 'liquid_y_offset', 0),
        riseDelta: numberAt(body, 'rise_delta', 0.01),
        sinkDelta: numberAt(body, 'sink_delta', 0.01)
    })),
    create: (params, support) => {
        const inLiquid = (): boolean => support.flag('in_lava') || support.flag('in_water');
        /** The y the entity's feet float at: the top liquid block over it, `liquid_y_offset` down from its top. */
        const level = (): number | undefined => {
            const view = support.navigation();
            if (view === undefined) return undefined;
            const feet = blockOf(support.position());
            const liquid = (y: number): boolean => view.isLava({ ...feet, y }) || view.isWater({ ...feet, y });
            if (!liquid(feet.y)) return undefined;
            let top = feet.y;
            while (liquid(top + 1) && top - feet.y < 64) top += 1;
            return top + 1 - params.liquidYOffset;
        };
        return {
            canStart: inLiquid,
            canContinue: inLiquid,
            tick: () => {
                const target = level();
                if (target === undefined) return;
                const y = support.position().y;
                if (y < target) support.world.push?.({ x: 0, y: params.riseDelta, z: 0 });
                else if (y > target + params.sinkDelta) support.world.push?.({ x: 0, y: -params.sinkDelta, z: 0 });
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.panic` declares. */
export interface PanicParams {
    readonly speedMultiplier: number;
    /** Whether damage from another mob counts as a reason to panic. */
    readonly ignoreMobDamage: boolean;
    /** Which damage causes start a panic; an empty list accepts every one. */
    readonly damageSources: readonly string[];
    /** Whether the panic runs even when nothing hurt the entity. */
    readonly force: boolean;
    /** Whether the entity runs for water rather than away. */
    readonly preferWater: boolean;
    readonly panicSound: string | undefined;
    /** How long between panic sounds, in ticks. */
    readonly soundInterval: Range;
}

/**
 * `minecraft:behavior.panic`, which 37 vanilla entities carry, 32 of them at
 * priority 1.
 *
 * Java's `PanicGoal` looks for water within 5 blocks when the entity is on
 * fire and otherwise draws a position 5 blocks out and 4 up, which is the
 * shape here.
 */
export const panic = goal<PanicParams>({
    name: 'minecraft:behavior.panic',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1.25),
        ignoreMobDamage: booleanAt(body, 'ignore_mob_damage', false),
        damageSources: body.damage_sources === undefined ? PANIC_DAMAGE_SOURCES : stringsAt(body, 'damage_sources'),
        force: booleanAt(body, 'force', false),
        preferWater: booleanAt(body, 'prefer_water', false),
        panicSound: stringAt(body, 'panic_sound'),
        soundInterval: tickRangeAt(body, 'sound_interval', [0, 0])
    })),
    create: (params, support) => {
        let soundTimer = 0;
        const hurt = (): boolean => {
            if (params.force) return true;
            const last = support.world.damagers?.().at(-1);
            if (last === undefined) return false;
            if (params.ignoreMobDamage && last.mob !== undefined) return false;
            return params.damageSources.includes('all') || params.damageSources.includes(last.cause);
        };

        const walk = walkTo(support, {
            find: () => {
                if (support.flag('on_fire') || params.preferWater) {
                    const water = support.world.blocks?.({
                        identifiers: ['minecraft:water'],
                        range: 5,
                        height: 4,
                        limit: 1
                    })[0];
                    if (water !== undefined) return centerOf(water.position);
                }
                return support.navigator.randomTarget(5, 4, () => support.random());
            },
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: DEFAULT_GOAL_RADIUS
        });

        return {
            ...walk,
            canStart: () => hurt() && (walk.canStart?.() ?? false),
            start: () => {
                soundTimer = 0;
                walk.start?.();
            },
            tick: () => {
                if (params.panicSound !== undefined && (soundTimer -= 1) <= 0) {
                    soundTimer = support.between(params.soundInterval[0], params.soundInterval[1]);
                    support.playSound(params.panicSound);
                }
                walk.tick?.();
            }
        };
    }
});

/** What `minecraft:behavior.avoid_mob_type` declares. */
export interface AvoidMobTypeParams {
    readonly entityTypes: readonly TargetEntityType[];
    /** How far the entity notices something to avoid, in blocks. */
    readonly maxDistance: number;
    /** How far the entity runs, in blocks. */
    readonly maxFlee: number;
    /** Whether the entity runs from something it cannot see. */
    readonly ignoreVisibility: boolean;
    /** Whether the entity drops its attack target when it starts fleeing. */
    readonly removeTarget: boolean;
    /** How likely the entity is to flee per point of the threat's strength. */
    readonly probabilityPerStrength: number;
    readonly avoidSound: string | undefined;
    readonly soundInterval: Range;
    readonly onEscapeEvent: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.avoid_mob_type`, which 28 vanilla entities carry.
 *
 * Java's `AvoidEntityGoal` draws a position 16 blocks out and 7 up away from
 * the threat and refuses it when it is no further from the threat than the
 * entity already is, which is the condition here.
 */
export const avoidMobType = goal<AvoidMobTypeParams>({
    name: 'minecraft:behavior.avoid_mob_type',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        maxDistance: numberAt(body, 'max_dist', 3),
        maxFlee: numberAt(body, 'max_flee', 10),
        ignoreVisibility: booleanAt(body, 'ignore_visibility', false),
        removeTarget: booleanAt(body, 'remove_target', false),
        probabilityPerStrength: numberAt(body, 'probability_per_strength', 1),
        avoidSound: stringAt(body, 'avoid_mob_sound'),
        soundInterval: tickRangeAt(body, 'sound_interval', [3, 8]),
        onEscapeEvent: eventAt(body, 'on_escape_event')
    })),
    create: (params, support) => {
        let threat: GoalMob | undefined;
        let walking = false;
        const candidateFamilies = targetFamilies(params.entityTypes);
        const families = candidateFamilies === undefined ? undefined : [...candidateFamilies];
        const radius = Math.max(params.maxDistance, ...params.entityTypes.map((entry) => entry.maxDistance));

        /** A position further from the threat than the entity stands now. */
        const away = (from: EntityPosition): EntityPosition | undefined => {
            const here = support.position();
            const dx = here.x - from.x;
            const dz = here.z - from.z;
            const length = Math.hypot(dx, dz) || 1;
            const candidate = {
                x: here.x + (dx / length) * FLEE_XZ_DISTANCE,
                y: here.y,
                z: here.z + (dz / length) * FLEE_XZ_DISTANCE
            };
            return support.navigator.canReach(candidate, FLEE_Y_DISTANCE) ? candidate : undefined;
        };

        return {
            canStart: () => {
                if (families?.length === 0) {
                    threat = undefined;
                    return false;
                }
                threat = support
                    .mobs(radius, families)
                    .find(
                        (mob) =>
                            support.accepts(params.entityTypes, mob) && (params.ignoreVisibility || support.canSee(mob))
                    );
                return threat !== undefined && away(threat.position()) !== undefined;
            },
            canContinue: () => walking,
            start: () => {
                const destination = threat === undefined ? undefined : away(threat.position());
                // The table's walk and sprint multipliers are the speeds a flee runs at, because
                // `avoid_mob_type` has no `speed_multiplier`; Java sprints from a threat within 7 blocks.
                const entry = threat === undefined ? undefined : support.entryFor(params.entityTypes, threat);
                const close = threat !== undefined && support.distanceTo(threat.position()) < AVOID_SPRINT_DISTANCE;
                const speed = close ? entry?.sprintSpeedMultiplier : entry?.walkSpeedMultiplier;
                walking = destination !== undefined && support.navigator.moveTo(destination, speed ?? 1, 1);
                if (params.removeTarget) support.setTarget(undefined);
                support.playSound(params.avoidSound);
            },
            tick: () => {
                // Java's AvoidEntityGoal sprints while the threat is within 7 blocks and walks beyond.
                const entry = threat === undefined ? undefined : support.entryFor(params.entityTypes, threat);
                if (threat !== undefined && entry !== undefined) {
                    const close = support.distanceTo(threat.position()) < AVOID_SPRINT_DISTANCE;
                    support.navigator.setSpeed(close ? entry.sprintSpeedMultiplier : entry.walkSpeedMultiplier);
                }
                if (support.navigator.tick()) return;
                walking = false;
                support.fire(params.onEscapeEvent, threat);
            },
            stop: () => {
                walking = false;
                threat = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.avoid_block` declares. */
export interface AvoidBlockParams {
    /** The blocks the entity runs from. */
    readonly targetBlocks: readonly string[];
    /** How far it looks for them horizontally, in blocks. */
    readonly searchRange: number;
    /** How far it looks vertically, in blocks. */
    readonly searchHeight: number;
    /** How the entity picks between the blocks it found. */
    readonly selectionMethod: string;
    /** How many ticks between searches. */
    readonly tickInterval: number;
    readonly walkSpeedModifier: number;
    readonly sprintSpeedModifier: number;
    readonly avoidBlockSound: string | undefined;
    readonly soundInterval: Range;
    readonly onEscape: readonly GoalEvent[];
}

/**
 * `minecraft:behavior.avoid_block`, which the strider and the hoglin carry.
 * The entity walks away from a block type rather than from a mob.
 */
export const avoidBlock = goal<AvoidBlockParams>({
    name: 'minecraft:behavior.avoid_block',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        targetBlocks: stringsAt(body, 'target_blocks'),
        searchRange: numberAt(body, 'search_range', 8),
        searchHeight: numberAt(body, 'search_height', 4),
        selectionMethod: stringAt(body, 'target_selection_method') ?? 'nearest',
        tickInterval: numberAt(body, 'tick_interval', 1),
        walkSpeedModifier: numberAt(body, 'walk_speed_modifier', 1),
        sprintSpeedModifier: numberAt(body, 'sprint_speed_modifier', 1),
        avoidBlockSound: stringAt(body, 'avoid_block_sound'),
        soundInterval: tickRangeAt(body, 'sound_interval', [3, 8]),
        onEscape: eventsAt(body, 'on_escape')
    })),
    create: (params, support) => {
        let walking = false;
        let countdown = 0;

        return {
            canStart: () => {
                if ((countdown -= 1) > 0) return false;
                countdown = params.tickInterval;
                const found = support.world.blocks?.({
                    identifiers: params.targetBlocks,
                    range: params.searchRange,
                    height: params.searchHeight,
                    limit: 1
                })[0];
                if (found === undefined) return false;
                const here = support.position();
                const dx = here.x - found.position.x;
                const dz = here.z - found.position.z;
                const length = Math.hypot(dx, dz) || 1;
                walking = support.navigator.moveTo(
                    {
                        x: here.x + (dx / length) * params.searchRange,
                        y: here.y,
                        z: here.z + (dz / length) * params.searchRange
                    },
                    params.sprintSpeedModifier,
                    DEFAULT_GOAL_RADIUS
                );
                return walking;
            },
            canContinue: () => walking,
            tick: () => {
                if (support.navigator.tick()) return;
                walking = false;
                support.fireAll(params.onEscape);
            },
            stop: () => {
                walking = false;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.flee_sun`, which the seven sunlight-sensitive entities
 * carry.
 *
 * Java's `FleeSunGoal` checks its five preconditions before drawing, then
 * tries ten positions in a 20 by 6 by 20 box and keeps the first hidden,
 * negatively valued position. It does not pathfind each candidate.
 */
export const fleeSun = goal<{ readonly speedMultiplier: number }>({
    name: 'minecraft:behavior.flee_sun',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1) })),
    create: (params, support) =>
        walkTo(support, {
            find: () => {
                if (support.target() !== undefined) return undefined;
                if (!support.isBrightOutside()) return undefined;
                if (!support.flag('on_fire')) return undefined;
                const view = support.navigation();
                if (view === undefined) return undefined;
                const here = support.position();
                if (view.canSeeSky?.(blockOf(here)) !== true) return undefined;
                if (support.entity.filterContext().self.equipment?.('head', 0) !== undefined) return undefined;

                for (let attempt = 0; attempt < 10; attempt += 1) {
                    const candidate = {
                        x: Math.floor(here.x) + support.randomInt(20) - 10,
                        y: Math.floor(here.y) + support.randomInt(6) - 3,
                        z: Math.floor(here.z) + support.randomInt(20) - 10
                    };
                    if (view.canSeeSky?.(candidate) !== false) continue;
                    if ((view.walkTargetValue?.(candidate) ?? -0.5) >= 0) continue;
                    return centerOf(candidate);
                }
                return undefined;
            },
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: DEFAULT_GOAL_RADIUS
        })
});

/**
 * `minecraft:behavior.find_cover`, which the fox carries. It is `flee_sun`
 * with a cooldown, and it runs in daylight and in rain.
 */
export const findCover = goal<{ readonly speedMultiplier: number; readonly cooldown: number }>({
    name: 'minecraft:behavior.find_cover',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        cooldown: ticksAt(body, 'cooldown_time', 2)
    })),
    create: (params, support) => {
        let cooldown = 0;
        const walk = walkTo(support, {
            find: () => {
                const view = support.navigation();
                if (view === undefined) return undefined;
                const here = support.position();
                for (let attempt = 0; attempt < 10; attempt += 1) {
                    const candidate = {
                        x: Math.floor(here.x) + Math.floor(support.random() * 16) - 8,
                        y: Math.floor(here.y),
                        z: Math.floor(here.z) + Math.floor(support.random() * 16) - 8
                    };
                    if (view.isSunlit?.(candidate) !== false) continue;
                    if (support.navigator.canReach(candidate, 1)) return centerOf(candidate);
                }
                return undefined;
            },
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: DEFAULT_GOAL_RADIUS
        });

        return {
            ...walk,
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                return walk.canStart?.() ?? false;
            },
            stop: () => {
                cooldown = params.cooldown;
                walk.stop?.();
            }
        };
    }
});

/** What a block-seeking goal declares. */
export interface MoveToBlockParams {
    readonly speedMultiplier: number;
    /** The blocks the goal walks to. */
    readonly targetBlocks: readonly string[];
    /** How far it looks horizontally, in blocks. */
    readonly searchRange: number;
    /** How far it looks vertically, in blocks. */
    readonly searchHeight: number;
    /** How many candidates it considers. */
    readonly searchCount: number;
    /** How close counts as arriving, in blocks. */
    readonly goalRadius: number;
    /** How many ticks between searches. */
    readonly tickInterval: number;
    /** The chance per attempt that the goal runs at all, in [0, 1]. */
    readonly startChance: number;
    /** How long the entity waits at the block, in ticks. */
    readonly stayDuration: number;
    /** How far from the found block the entity actually stands. */
    readonly targetOffset: EntityPosition;
    readonly onReach: readonly GoalEvent[];
    readonly onStayCompleted: readonly GoalEvent[];
}

const moveToBlockFrom = (body: GoalBody, defaults: Partial<MoveToBlockParams> = {}): MoveToBlockParams => {
    const offset = Array.isArray(body.target_offset)
        ? body.target_offset.filter((part) => typeof part === 'number')
        : [];
    return {
        speedMultiplier: numberAt(body, 'speed_multiplier', defaults.speedMultiplier ?? 1),
        targetBlocks:
            stringsAt(body, 'target_blocks').length > 0
                ? stringsAt(body, 'target_blocks')
                : (defaults.targetBlocks ?? []),
        searchRange: numberAt(body, 'search_range', defaults.searchRange ?? 16),
        searchHeight: numberAt(body, 'search_height', defaults.searchHeight ?? 4),
        searchCount: numberAt(body, 'search_count', defaults.searchCount ?? 10),
        goalRadius: numberAt(body, 'goal_radius', defaults.goalRadius ?? 1.5),
        tickInterval: numberAt(body, 'tick_interval', defaults.tickInterval ?? 20),
        startChance: numberAt(body, 'start_chance', defaults.startChance ?? 1),
        stayDuration: ticksAt(body, 'stay_duration', 0),
        targetOffset: { x: offset[0] ?? 0, y: offset[1] ?? 0, z: offset[2] ?? 0 },
        onReach: eventsAt(body, 'on_reach'),
        onStayCompleted: eventsAt(body, 'on_stay_completed')
    };
};

/** The shared loop for every goal that searches for a block and walks to it. */
const walkToBlock = (support: GoalSupport, params: MoveToBlockParams): Goal => {
    let staying = 0;
    const walk = walkTo(support, {
        find: () => {
            if (!support.chance(params.startChance)) return undefined;
            const found = support.world.blocks?.({
                identifiers: params.targetBlocks,
                range: params.searchRange,
                height: params.searchHeight,
                limit: 1
            });
            const block = found?.slice(0, Math.max(1, params.searchCount))[0];
            if (block === undefined) return undefined;
            const center = centerOf(block.position);
            return {
                x: center.x + params.targetOffset.x,
                y: center.y + params.targetOffset.y,
                z: center.z + params.targetOffset.z
            };
        },
        speedMultiplier: params.speedMultiplier,
        interval: params.tickInterval,
        goalRadius: params.goalRadius,
        requiresUpdateEveryTick: true,
        onArrive: () => {
            support.fireAll(params.onReach);
            staying = params.stayDuration;
        }
    });

    return {
        ...walk,
        canContinue: () => staying > 0 || (walk.canContinue?.() ?? false),
        tick: () => {
            if (staying > 0) {
                staying -= 1;
                if (staying === 0) support.fireAll(params.onStayCompleted);
                return;
            }
            walk.tick?.();
        },
        stop: () => {
            staying = 0;
            walk.stop?.();
        }
    };
};

/**
 * `minecraft:behavior.move_to_block`, which the villager carries for its bed
 * and bell. The `target_blocks` list and `target_offset` decide where the
 * entity ends up standing.
 *
 * Java's `MoveToBlockGoal` searches again every 200 to 400 ticks and gives up
 * after 1200. Bedrock documents no default for `tick_interval`, so this uses
 * 20 ticks, which is one second and matches what the vanilla bodies that set
 * the key write.
 */
export const moveToBlock = goal<MoveToBlockParams>({
    name: 'minecraft:behavior.move_to_block',
    controlFlags: ['move'],
    schema: bodySchema((body) => moveToBlockFrom(body)),
    create: (params, support) => walkToBlock(support, params)
});

/**
 * `minecraft:behavior.move_to_water`, which the four amphibious entities
 * carry. It is the block search pinned to water.
 */
export const moveToWater = goal<MoveToBlockParams>({
    name: 'minecraft:behavior.move_to_water',
    controlFlags: ['move'],
    schema: bodySchema((body) => moveToBlockFrom(body, { targetBlocks: ['minecraft:water'] })),
    create: (params, support) => walkToBlock(support, params)
});

/**
 * `minecraft:behavior.move_to_land`, which the turtle and the axolotl carry.
 * The destination is a solid block the entity can stand on rather than a named
 * block type, so the search runs over the navigation view.
 */
export const moveToLand = goal<MoveToBlockParams>({
    name: 'minecraft:behavior.move_to_land',
    controlFlags: ['move'],
    schema: bodySchema((body) => moveToBlockFrom(body)),
    create: (params, support) =>
        walkTo(support, {
            find: () => {
                const view = support.navigation();
                const here = support.position();
                if (view === undefined) return undefined;
                for (let attempt = 0; attempt < params.searchCount; attempt += 1) {
                    const candidate = {
                        x: Math.floor(here.x) + Math.floor((support.random() * 2 - 1) * params.searchRange),
                        y: Math.floor(here.y) + Math.floor((support.random() * 2 - 1) * params.searchHeight),
                        z: Math.floor(here.z) + Math.floor((support.random() * 2 - 1) * params.searchRange)
                    };
                    if (view.isWater(candidate)) continue;
                    if (!view.isSolid({ ...candidate, y: candidate.y - 1 })) continue;
                    if (support.navigator.canReach(candidate, params.goalRadius)) return centerOf(candidate);
                }
                return undefined;
            },
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: params.goalRadius
        })
});

/**
 * `minecraft:behavior.move_to_liquid`, which the strider carries. The
 * `material_type` names which liquid, so lava and water share one goal.
 */
export const moveToLiquid = goal<MoveToBlockParams & { readonly materialType: string }>({
    name: 'minecraft:behavior.move_to_liquid',
    controlFlags: ['move'],
    schema: bodySchema((body) => {
        const material = stringAt(body, 'material_type') ?? 'Water';
        const params = moveToBlockFrom(body, { targetBlocks: [`minecraft:${material.toLowerCase()}`] });
        return {
            ...params,
            // Java's `MoveToBlockGoal.getMoveToTarget` walks to the block over the liquid it found,
            // which is where a strider stands on lava, unless the body names its own offset.
            targetOffset: Array.isArray(body.target_offset) ? params.targetOffset : { x: 0, y: 1, z: 0 },
            materialType: material
        };
    }),
    create: (params, support) => walkToBlock(support, params)
});

/** How far one hop toward a patrol target goes, Java's `LongDistancePatrolGoal` cap of 10 blocks. */
const PATROL_HOP = 10;

/** How long a patrol waits after a hop it could not path, Java's `cooldown = tickCount + 200`, in ticks. */
const PATROL_COOLDOWN = 200;

/**
 * `minecraft:behavior.move_to_random_block`, which a patrol captain carries. Java's
 * `PatrollingMonster.LongDistancePatrolGoal`: the captain draws a patrol target up to
 * `block_distance` away across, as `findPatrolTarget` draws one up to 500 blocks away, and walks to
 * it in hops of at most 10 blocks, wandering a step and waiting 200 ticks when a hop has no path.
 */
export const moveToRandomBlock = goal<{
    readonly speedMultiplier: number;
    readonly withinRadius: number;
    readonly blockDistance: number;
}>({
    name: 'minecraft:behavior.move_to_random_block',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        withinRadius: numberAt(body, 'within_radius', 10),
        blockDistance: numberAt(body, 'block_distance', 16)
    })),
    create: (params, support) => {
        let target: EntityPosition | undefined;
        let cooldown = 0;
        const hop = (): boolean => {
            const here = support.position();
            if (target === undefined) {
                const reach = Math.floor(params.blockDistance);
                target = {
                    x: here.x - reach + support.randomInt(reach * 2 + 1),
                    y: here.y,
                    z: here.z - reach + support.randomInt(reach * 2 + 1)
                };
            }
            const dx = target.x - here.x;
            const dz = target.z - here.z;
            const length = Math.hypot(dx, dz);
            if (length <= params.withinRadius) {
                target = undefined;
                return false;
            }
            const scale = Math.min(1, PATROL_HOP / length);
            const step = { x: here.x + dx * scale, y: here.y, z: here.z + dz * scale };
            if (support.navigator.moveTo(step, params.speedMultiplier, DEFAULT_GOAL_RADIUS)) return true;
            const wander = support.navigator.randomTarget(8, 4, () => support.random());
            cooldown = PATROL_COOLDOWN;
            return (
                wander !== undefined && support.navigator.moveTo(wander, params.speedMultiplier, DEFAULT_GOAL_RADIUS)
            );
        };
        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                return hop();
            },
            canContinue: () => support.navigator.walking,
            tick: () => {
                support.navigator.tick();
            },
            stop: () => {
                support.navigator.stop();
            }
        };
    }
});

/** What the home and dwelling restriction goals declare. */
export interface RestrictionParams {
    readonly speedMultiplier: number;
    /** How close to home counts as arriving, in blocks. */
    readonly goalRadius: number;
}

const restrictionFrom = (body: GoalBody): RestrictionParams => ({
    speedMultiplier: numberAt(body, 'speed_multiplier', 1),
    goalRadius: numberAt(body, 'goal_radius', 2)
});

/**
 * `minecraft:behavior.move_towards_home_restriction`, which four vanilla
 * entities carry. It pulls the entity back inside the radius of its
 * `minecraft:home` component.
 */
export const moveTowardsHomeRestriction = goal<RestrictionParams>({
    name: 'minecraft:behavior.move_towards_home_restriction',
    controlFlags: ['move'],
    schema: bodySchema(restrictionFrom),
    create: (params, support) =>
        walkTo(support, {
            find: () => support.world.home?.(),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: params.goalRadius
        })
});

/**
 * `minecraft:behavior.move_towards_dwelling_restriction`, which the villager
 * and the iron golem carry. The dwelling is the village the
 * `minecraft:dweller` component binds the entity to.
 */
export const moveTowardsDwellingRestriction = goal<RestrictionParams>({
    name: 'minecraft:behavior.move_towards_dwelling_restriction',
    controlFlags: ['move'],
    schema: bodySchema(restrictionFrom),
    create: (params, support) =>
        walkTo(support, {
            find: () => support.world.poi?.('village', 64),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: params.goalRadius
        })
});

/**
 * `minecraft:behavior.go_home`, which the bee, the turtle and the dolphin
 * carry. It differs from the restriction goals in that it fires events when
 * the entity arrives or gives up.
 */
export const goHome = goal<
    RestrictionParams & {
        readonly interval: number;
        readonly onHome: readonly GoalEvent[];
        readonly onFailed: readonly GoalEvent[];
    }
>({
    name: 'minecraft:behavior.go_home',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        ...restrictionFrom(body),
        interval: numberAt(body, 'interval', 1),
        onHome: eventsAt(body, 'on_home'),
        onFailed: eventsAt(body, 'on_failed')
    })),
    create: (params, support) => {
        const walk = walkTo(support, {
            find: () => support.world.home?.(),
            speedMultiplier: params.speedMultiplier,
            interval: params.interval,
            goalRadius: params.goalRadius,
            onArrive: () => support.fireAll(params.onHome)
        });
        return {
            ...walk,
            canStart: () => {
                const started = walk.canStart?.() ?? false;
                if (!started && support.world.home?.() === undefined) support.fireAll(params.onFailed);
                return started;
            }
        };
    }
});

/** What the village movement goals declare. */
export interface VillageMoveParams {
    readonly speedMultiplier: number;
    /** How close counts as arriving, in blocks. */
    readonly goalRadius: number;
    /** How far the entity looks for the village, in blocks. */
    readonly searchRange: number;
    /** The chance per attempt of setting out, in [0, 1]. */
    readonly startChance: number;
    /** How long before the goal may run again, in ticks. */
    readonly cooldown: number;
}

const villageMoveFrom = (body: GoalBody): VillageMoveParams => ({
    speedMultiplier: numberAt(body, 'speed_multiplier', 1),
    goalRadius: numberAt(body, 'goal_radius', 2),
    searchRange: numberAt(body, 'search_range', 64),
    startChance: numberAt(body, 'start_chance', 1),
    cooldown: ticksAt(body, 'cooldown_time', 0)
});

/**
 * `minecraft:behavior.move_to_village`, which the five raid entities carry.
 * It walks the entity to the nearest village.
 */
export const moveToVillage = goal<VillageMoveParams>({
    name: 'minecraft:behavior.move_to_village',
    controlFlags: ['move'],
    schema: bodySchema(villageMoveFrom),
    create: (params, support) =>
        walkTo(support, {
            find: () => support.world.poi?.('village', params.searchRange),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: params.goalRadius
        })
});

/**
 * `minecraft:behavior.stroll_towards_village`, which the cat carries. It is
 * `move_to_village` with a start chance and a cooldown, so the entity drifts
 * toward the village rather than making straight for it.
 */
export const strollTowardsVillage = goal<VillageMoveParams>({
    name: 'minecraft:behavior.stroll_towards_village',
    controlFlags: ['move'],
    schema: bodySchema(villageMoveFrom),
    create: (params, support) => {
        let cooldown = 0;
        const walk = walkTo(support, {
            find: () => support.world.poi?.('village', params.searchRange),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: params.goalRadius
        });
        return {
            ...walk,
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                if (!support.chance(params.startChance)) return false;
                return walk.canStart?.() ?? false;
            },
            stop: () => {
                cooldown = params.cooldown;
                walk.stop?.();
            }
        };
    }
});

/** The village points of interest an iron golem strolls toward, in the order it looks for them. */
const VILLAGE_STROLL_POIS = ['bed', 'door', 'village'] as const;

/** How far an iron golem looks for a village point of interest, from Java's 32-block village search. */
const VILLAGE_STROLL_RANGE = 32;

/**
 * `minecraft:behavior.move_through_village`, which the villager and the iron golem carry.
 *
 * With `only_at_night` it walks the village's door positions at night, as Java's
 * `MoveThroughVillageGoal` does. Without it the entity strolls about its village at any time of
 * day, as Java's `GolemRandomStrollInVillageGoal` does for the iron golem: a `RandomStrollGoal`
 * with an interval of 240 whose destination is, three times in ten, a random spot within 10
 * blocks, and otherwise a point of interest of the village, falling back to the random spot.
 */
export const moveThroughVillage = goal<{ readonly speedMultiplier: number; readonly onlyAtNight: boolean }>({
    name: 'minecraft:behavior.move_through_village',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        onlyAtNight: booleanAt(body, 'only_at_night', false)
    })),
    create: (params, support) => {
        const anywhere = (): EntityPosition | undefined =>
            support.navigator.randomTarget(10, 7, () => support.random());
        const villagePoint = (): EntityPosition | undefined => {
            const here = support.position();
            for (const kind of VILLAGE_STROLL_POIS) {
                const point = support.world.poi?.(kind, VILLAGE_STROLL_RANGE);
                if (point !== undefined && Math.hypot(point.x - here.x, point.z - here.z) > 2) return point;
            }
            return undefined;
        };
        const walk = params.onlyAtNight
            ? walkTo(support, {
                  find: () => support.world.poi?.('door', VILLAGE_STROLL_RANGE),
                  speedMultiplier: params.speedMultiplier,
                  interval: 0,
                  goalRadius: 1
              })
            : walkTo(support, {
                  find: () => (support.chance(0.3) ? anywhere() : (villagePoint() ?? anywhere())),
                  speedMultiplier: params.speedMultiplier,
                  interval: 240,
                  goalRadius: DEFAULT_GOAL_RADIUS
              });
        return {
            ...walk,
            canStart: () => {
                if (params.onlyAtNight && !support.isNight()) return false;
                return walk.canStart?.() ?? false;
            }
        };
    }
});

/** What `minecraft:behavior.move_indoors` and `move_outdoors` declare. */
export interface ShelterParams {
    readonly speedMultiplier: number;
    /** How long before the goal may run again after it fails, in ticks. */
    readonly timeoutCooldown: number;
}

const shelterFrom = (body: GoalBody): ShelterParams => ({
    speedMultiplier: numberAt(body, 'speed_multiplier', 1),
    timeoutCooldown: ticksAt(body, 'timeout_cooldown', 8)
});

/**
 * `minecraft:behavior.move_indoors`, which the villager and the cat carry.
 * It sends the entity to the nearest indoor point of interest at night and in
 * rain.
 */
export const moveIndoors = goal<ShelterParams>({
    name: 'minecraft:behavior.move_indoors',
    controlFlags: ['move'],
    schema: bodySchema(shelterFrom),
    create: (params, support) => {
        let cooldown = 0;
        const walk = walkTo(support, {
            find: () => support.world.poi?.('indoors', 32),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: 1
        });
        return {
            ...walk,
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                if (!support.isNight() && !support.isRaining()) return false;
                const started = walk.canStart?.() ?? false;
                if (!started) cooldown = params.timeoutCooldown;
                return started;
            }
        };
    }
});

/**
 * `minecraft:behavior.move_outdoors`, which the villager carries. It is
 * `move_indoors` in reverse, and it runs in the morning.
 */
export const moveOutdoors = goal<ShelterParams>({
    name: 'minecraft:behavior.move_outdoors',
    controlFlags: ['move'],
    schema: bodySchema(shelterFrom),
    create: (params, support) => {
        let cooldown = 0;
        const walk = walkTo(support, {
            find: () => support.world.poi?.('outdoors', 32),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: 1
        });
        return {
            ...walk,
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                if (support.isNight()) return false;
                const started = walk.canStart?.() ?? false;
                if (!started) cooldown = params.timeoutCooldown;
                return started;
            }
        };
    }
});

/** What `minecraft:behavior.explore_outskirts` declares. */
export interface ExploreOutskirtsParams {
    readonly speedMultiplier: number;
    /** How far from the village edge the entity wanders, in blocks. */
    readonly exploreDistance: number;
    /** How long it waits at the destination, in ticks. */
    readonly maxWaitTime: number;
    /** How far the destination has to be from the entity, in blocks. */
    readonly minDistanceFromTarget: number;
}

/**
 * `minecraft:behavior.explore_outskirts`, which the wandering trader carries.
 * It walks past the edge of the village and waits there before coming back.
 */
export const exploreOutskirts = goal<ExploreOutskirtsParams>({
    name: 'minecraft:behavior.explore_outskirts',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        exploreDistance: numberAt(body, 'explore_dist', 6),
        maxWaitTime: ticksAt(body, 'max_wait_time', 10),
        minDistanceFromTarget: numberAt(body, 'min_dist_from_target', 2.5)
    })),
    create: (params, support) => {
        let waiting = 0;
        const walk = walkTo(support, {
            find: () => support.navigator.randomTarget(params.exploreDistance, 4, () => support.random()),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: params.minDistanceFromTarget,
            onArrive: () => {
                waiting = params.maxWaitTime;
            }
        });
        return {
            ...walk,
            canContinue: () => waiting > 0 || (walk.canContinue?.() ?? false),
            tick: () => {
                if (waiting > 0) {
                    waiting -= 1;
                    return;
                }
                walk.tick?.();
            },
            stop: () => {
                waiting = 0;
                walk.stop?.();
            }
        };
    }
});

/**
 * `minecraft:behavior.investigate_suspicious_location`, which the sniffer and
 * the warden carry. It walks to the position the suspicion tracking component
 * recorded.
 */
export const investigateSuspiciousLocation = goal<{ readonly speedMultiplier: number }>({
    name: 'minecraft:behavior.investigate_suspicious_location',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1) })),
    create: (params, support) =>
        walkTo(support, {
            find: () => support.world.poi?.('suspicious_location', 32),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: 1
        })
});

/**
 * `minecraft:behavior.find_underwater_treasure`, which the dolphin carries.
 * It swims toward the nearest buried treasure and stops short of it, which is
 * what leads a player there. Java's `DolphinSwimToTreasureGoal` runs only
 * while the dolphin holds a bribe, and spends it when the swim ends; an entity
 * with no `minecraft:bribeable` swims without one.
 */
export const findUnderwaterTreasure = goal<{
    readonly speedMultiplier: number;
    readonly searchRange: number;
    readonly stopDistance: number;
}>({
    name: 'minecraft:behavior.find_underwater_treasure',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        searchRange: numberAt(body, 'search_range', 30),
        stopDistance: numberAt(body, 'stop_distance', 2)
    })),
    create: (params, support) => {
        const walk = walkTo(support, {
            canStart: () => isBribed(support.entity) !== false,
            find: () => support.world.poi?.('buried_treasure', params.searchRange),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: params.stopDistance
        });
        return {
            ...walk,
            stop: () => {
                walk.stop?.();
                spendBribe(support.entity);
            }
        };
    }
});

/** What `minecraft:behavior.circle_around_anchor` declares. */
export interface CircleAroundAnchorParams {
    /** How close to the circle counts as on it, in blocks. */
    readonly goalRadius: number;
    /** How high above the anchor the entity flies, in blocks. */
    readonly heightAboveTargetRange: Range;
    /** How much the height drifts between circuits, in blocks. */
    readonly heightOffsetRange: Range;
}

/**
 * `minecraft:behavior.circle_around_anchor`, which the phantom carries. The
 * anchor is the position the phantom spawned above, and the goal keeps it
 * orbiting there between dives.
 */
export const circleAroundAnchor = goal<CircleAroundAnchorParams>({
    name: 'minecraft:behavior.circle_around_anchor',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        goalRadius: numberAt(body, 'goal_radius', 1),
        heightAboveTargetRange: rangeAt(body, 'height_above_target_range', [20, 40]),
        heightOffsetRange: rangeAt(body, 'height_offset_range', [-1, 1])
    })),
    create: (params, support) => {
        /** How wide the orbit is, which is the vanilla phantom's circling radius in blocks. */
        const orbitRadius = 10;
        let angle = 0;
        return {
            canStart: () => true,
            canContinue: () => true,
            start: () => {
                angle = support.random() * Math.PI * 2;
            },
            tick: () => {
                if (support.navigator.tick()) return;
                angle += Math.PI / 4;
                const anchor = support.world.home?.() ?? support.position();
                const height = support.between(params.heightAboveTargetRange[0], params.heightAboveTargetRange[1]);
                support.navigator.moveTo(
                    {
                        x: anchor.x + Math.cos(angle) * orbitRadius,
                        y: anchor.y + height,
                        z: anchor.z + Math.sin(angle) * orbitRadius
                    },
                    1,
                    params.goalRadius
                );
            },
            stop: () => {
                support.navigator.stop();
            }
        };
    }
});

/** What `minecraft:behavior.jump_to_block` declares. */
export interface JumpToBlockParams {
    /** How long between jumps, in ticks. */
    readonly cooldown: Range;
    /** How far the destination has to be, in blocks. */
    readonly minimumDistance: number;
    /** How long a walking path would have to be before jumping is worth it. */
    readonly minimumPathLength: number;
    /** How far the goal looks, in blocks. */
    readonly searchWidth: number;
    readonly searchHeight: number;
    /** How the jump velocity scales with the distance. */
    readonly scaleFactor: number;
    readonly maxVelocity: number;
    /** Blocks the entity refuses to land on. */
    readonly forbiddenBlocks: readonly string[];
    /** Blocks the entity prefers to land on. */
    readonly preferredBlocks: readonly string[];
    /** The chance of taking a preferred block over any other, in [0, 1]. */
    readonly preferredBlocksChance: number;
}

/**
 * `minecraft:behavior.jump_to_block`, which the goat and the cat carry. The
 * entity leaps across a gap rather than walking around it.
 */
export const jumpToBlock = goal<JumpToBlockParams>({
    name: 'minecraft:behavior.jump_to_block',
    controlFlags: ['move', 'jump'],
    schema: bodySchema((body) => ({
        cooldown: tickRangeAt(body, 'cooldown_range', [5, 10]),
        minimumDistance: numberAt(body, 'minimum_distance', 2),
        minimumPathLength: numberAt(body, 'minimum_path_length', 5),
        searchWidth: numberAt(body, 'search_width', 8),
        searchHeight: numberAt(body, 'search_height', 10),
        scaleFactor: numberAt(body, 'scale_factor', 0.7),
        maxVelocity: numberAt(body, 'max_velocity', 1.5),
        forbiddenBlocks: stringsAt(body, 'forbidden_blocks'),
        preferredBlocks: stringsAt(body, 'preferred_blocks'),
        preferredBlocksChance: numberAt(body, 'preferred_blocks_chance', 0.5)
    })),
    create: (params, support) => {
        let destination: EntityPosition | undefined;
        let cooldown = 0;
        let airborne = false;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                const preferred =
                    params.preferredBlocks.length > 0 && support.chance(params.preferredBlocksChance)
                        ? support.world.blocks?.({
                              identifiers: params.preferredBlocks,
                              range: params.searchWidth,
                              height: params.searchHeight
                          })
                        : undefined;
                const candidate = (
                    preferred ??
                    support.world.blocks?.({
                        range: params.searchWidth,
                        height: params.searchHeight
                    })
                )?.find(
                    (block) =>
                        !params.forbiddenBlocks.includes(block.identifier) &&
                        support.distanceTo(centerOf(block.position)) >= params.minimumDistance
                );
                destination = candidate === undefined ? undefined : centerOf(candidate.position);
                return destination !== undefined;
            },
            canContinue: () => airborne,
            start: () => {
                if (destination === undefined) return;
                const here = support.position();
                airborne = true;
                support.world.push?.({
                    x: Math.min(params.maxVelocity, (destination.x - here.x) * params.scaleFactor * 0.1),
                    y: Math.min(params.maxVelocity, Math.max(0.4, (destination.y - here.y) * params.scaleFactor)),
                    z: Math.min(params.maxVelocity, (destination.z - here.z) * params.scaleFactor * 0.1)
                });
            },
            tick: () => {
                if (support.flag('on_ground')) airborne = false;
            },
            stop: () => {
                airborne = false;
                cooldown = support.between(params.cooldown[0], params.cooldown[1]);
                destination = undefined;
            }
        };
    }
});

/** The air supply below which Java's `BreathAirGoal.canUse` sends the entity up, in ticks. */
const BREATH_AIR_TICKS = 140;

/** Whether the entity's air has run below {@link BREATH_AIR_TICKS}; an entity with no air state never does. */
const outOfBreath = (support: GoalSupport): boolean =>
    (support.entity.componentState.get(AIR_STATE)?.remaining ?? Number.POSITIVE_INFINITY) < BREATH_AIR_TICKS;

/**
 * `minecraft:behavior.swim_up_for_breath`, which the dolphin carries. It
 * drives the entity to the surface when its air runs low: Java's
 * `BreathAirGoal`, which starts once the air supply is below 140 ticks.
 */
export const swimUpForBreath = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.swim_up_for_breath',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => support.flag('is_underwater') && outOfBreath(support),
        canContinue: () => support.flag('is_underwater') && outOfBreath(support) && support.navigator.walking,
        start: () => {
            const view = support.navigation();
            const here = support.position();
            if (view === undefined) {
                support.navigator.moveTo({ ...here, y: here.y + 4 }, 1, 1);
                return;
            }
            for (let height = 1; height <= 16; height += 1) {
                const candidate = { x: Math.floor(here.x), y: Math.floor(here.y) + height, z: Math.floor(here.z) };
                if (view.isWater(candidate)) continue;
                support.navigator.moveTo(centerOf(candidate), 1, 1);
                return;
            }
        },
        tick: () => {
            support.navigator.tick();
        },
        stop: () => {
            support.navigator.stop();
        }
    })
});

/** What `minecraft:behavior.swim_with_entity` declares. */
export interface SwimWithEntityParams {
    readonly entityTypes: readonly TargetEntityType[];
    readonly speedMultiplier: number;
    /** How far the goal looks for a companion, in blocks. */
    readonly searchRange: number;
    /** How close the entity swims, in blocks. */
    readonly stopDistance: number;
    /** How much faster the entity swims when it falls behind. */
    readonly catchUpMultiplier: number;
    /** How far behind counts as falling behind, in blocks. */
    readonly catchUpThreshold: number;
    /** The chance per check of letting the companion go, in [0, 1]. */
    readonly chanceToStop: number;
    /** The chance per check of starting, in [0, 1]. */
    readonly successRate: number;
    /** How many ticks between checks. */
    readonly stateCheckInterval: number;
    /** How closely the entity matches the companion's heading, in blocks. */
    readonly matchDirectionThreshold: number;
}

/**
 * `minecraft:behavior.swim_with_entity`, which the dolphin carries. It is
 * what makes a dolphin escort a swimming player.
 */
export const swimWithEntity = goal<SwimWithEntityParams>({
    name: 'minecraft:behavior.swim_with_entity',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        entityTypes: entityTypesAt(body),
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        searchRange: numberAt(body, 'search_range', 20),
        stopDistance: numberAt(body, 'stop_distance', 2),
        catchUpMultiplier: numberAt(body, 'catch_up_multiplier', 2.5),
        catchUpThreshold: numberAt(body, 'catch_up_threshold', 12),
        chanceToStop: numberAt(body, 'chance_to_stop', 0.0333),
        successRate: numberAt(body, 'success_rate', 0.1),
        stateCheckInterval: ticksAt(body, 'state_check_interval', 0.5),
        matchDirectionThreshold: numberAt(body, 'match_direction_threshold', 2)
    })),
    create: (params, support) => {
        let companion: GoalMob | undefined;
        let check = 0;

        return {
            canStart: () => {
                if (!support.chance(params.successRate)) return false;
                companion = support.findTarget(params.entityTypes, params.searchRange);
                return companion !== undefined;
            },
            canContinue: () => companion !== undefined && !support.chance(params.chanceToStop),
            start: () => {
                check = 0;
            },
            tick: () => {
                const friend = companion;
                if (friend === undefined) return;
                if ((check -= 1) > 0) {
                    support.navigator.tick();
                    return;
                }
                check = params.stateCheckInterval;
                const range = support.distanceTo(friend.position());
                const speed =
                    range > params.catchUpThreshold
                        ? params.speedMultiplier * params.catchUpMultiplier
                        : params.speedMultiplier;
                support.navigator.moveTo(friend.position(), speed, params.stopDistance);
            },
            stop: () => {
                companion = undefined;
                support.navigator.stop();
            }
        };
    }
});

/** What the follow goals declare. */
export interface FollowParams {
    readonly speedMultiplier: number;
    /** How far the goal looks for whom to follow, in blocks. */
    readonly searchRange: number;
    /** How close the entity gets before it stops, in blocks. */
    readonly stopDistance: number;
    /** How far away the entity has to be before it starts following, in blocks. */
    readonly startDistance: number;
    /** Which entities are worth following. */
    readonly filters: Filter | undefined;
    /** A type name that beats the filters when both match. */
    readonly preferredActorType: string | undefined;
}

/** The shared follow loop, which re-paths on Java's 10-tick interval. */
const followLoop = (
    support: GoalSupport,
    params: FollowParams,
    find: () => GoalMob | undefined,
    onArrive?: () => void
): Goal => {
    let companion: GoalMob | undefined;
    let repath = 0;

    return {
        canStart: () => {
            companion = find();
            return companion !== undefined && support.distanceTo(companion.position()) > params.startDistance;
        },
        canContinue: () => {
            if (companion === undefined) return false;
            const range = support.distanceTo(companion.position());
            return range > params.stopDistance && range <= params.searchRange;
        },
        start: () => {
            repath = 0;
        },
        tick: () => {
            const friend = companion;
            if (friend === undefined) return;
            support.lookAtMob(friend);
            if ((repath -= 1) > 0) {
                support.navigator.tick();
                return;
            }
            repath = 10;
            if (!support.navigator.moveTo(friend.position(), params.speedMultiplier, params.stopDistance)) onArrive?.();
        },
        stop: () => {
            companion = undefined;
            support.navigator.stop();
        }
    };
};

/**
 * `minecraft:behavior.follow_mob`, which the zombie villager and the
 * wandering trader's llama carry. The `filters` pick whom to follow.
 *
 * Java's `FollowMobGoal` re-paths every 10 ticks and stops at
 * `stop_distance`, which is the shape here.
 */
export const followMob = goal<FollowParams>({
    name: 'minecraft:behavior.follow_mob',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        searchRange: numberAt(body, 'search_range', 16),
        stopDistance: numberAt(body, 'stop_distance', 2),
        startDistance: numberAt(body, 'stop_distance', 2),
        filters: filterAt(body, 'filters'),
        preferredActorType: stringAt(body, 'preferred_actor_type')
    })),
    create: (params, support) =>
        followLoop(support, params, () =>
            support
                .mobs(params.searchRange)
                .find(
                    (mob) =>
                        (params.preferredActorType !== undefined && mob.identifier?.() === params.preferredActorType) ||
                        support.matches(params.filters, mob)
                )
        )
});

/**
 * `minecraft:behavior.follow_caravan`, which the llama and the trader llama
 * carry. A caravan is a chain, so the entity follows whichever llama is not
 * already followed.
 */
export const followCaravan = goal<FollowParams & { readonly entityCount: number }>({
    name: 'minecraft:behavior.follow_caravan',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        searchRange: numberAt(body, 'search_range', 8),
        stopDistance: numberAt(body, 'stop_distance', 2),
        startDistance: numberAt(body, 'start_distance', 2),
        filters: filterAt(body, 'filters'),
        preferredActorType: undefined,
        entityCount: numberAt(body, 'entity_count', 10)
    })),
    create: (params, support) =>
        followLoop(support, params, () =>
            support.mobs(params.searchRange).find((mob) => mob.view().flag?.('in_caravan') !== true)
        )
});

/**
 * `minecraft:behavior.follow_target_captain`, which the pillager and the
 * ravager carry. The captain is the raid leader, which the
 * `minecraft:is_illager_captain` component marks.
 */
export const followTargetCaptain = goal<FollowParams & { readonly followDistance: number }>({
    name: 'minecraft:behavior.follow_target_captain',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        searchRange: numberAt(body, 'within_radius', 16),
        stopDistance: numberAt(body, 'follow_distance', 5),
        startDistance: numberAt(body, 'follow_distance', 5),
        filters: undefined,
        preferredActorType: undefined,
        followDistance: numberAt(body, 'follow_distance', 5)
    })),
    create: (params, support) =>
        followLoop(support, params, () =>
            support
                .mobs(params.searchRange)
                .find((mob) => mob.view().hasComponent?.('minecraft:is_illager_captain') === true)
        )
});

/**
 * `minecraft:behavior.mount_pathing`, which 26 vanilla entities carry. It is
 * how a mounted entity goes after a target while it is riding something.
 *
 * Only while it is riding something, which is the gate this goal turns on.
 * The adult zombie carries it at priority 2 and `minecraft:behavior.
 * melee_box_attack` at priority 4, and both claim the `move` and `look`
 * flags, so a version that started on nothing more than having a target took
 * those flags off the attack at every priority below it and left the zombie
 * standing still in front of the player it had chosen. Mojang's own wording
 * is "while mounted", and the vanilla priorities only make sense that way.
 */
export const mountPathing = goal<{
    readonly speedMultiplier: number;
    readonly targetDistance: number;
    readonly trackTarget: boolean;
}>({
    name: 'minecraft:behavior.mount_pathing',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        targetDistance: numberAt(body, 'target_dist', 0),
        trackTarget: booleanAt(body, 'track_target', false)
    })),
    create: (params, support) => {
        let destination: GoalMob | undefined;
        return {
            canStart: () => {
                if (support.world.vehicle?.() === undefined) return false;

                destination = support.target() ?? support.world.riders?.()[0]?.target?.();
                return destination !== undefined;
            },
            canContinue: () => destination !== undefined && support.navigator.walking,
            start: () => {
                if (destination !== undefined)
                    support.navigator.moveTo(destination.position(), params.speedMultiplier, params.targetDistance + 1);
            },
            tick: () => {
                if (destination !== undefined && params.trackTarget) support.lookAtMob(destination);
                support.navigator.tick();
            },
            stop: () => {
                destination = undefined;
                support.navigator.stop();
            }
        };
    }
});

/**
 * `minecraft:behavior.run_around_like_crazy`, which the six horse types
 * carry.
 *
 * Java's `RunAroundLikeCrazyGoal` bucks on a 1-in-50 chance per tick while the
 * horse is untamed. With a player on its back the temper roll decides whether
 * the horse tames instead; otherwise it grows more patient and throws every
 * rider off.
 */
export const runAroundLikeCrazy = goal<{ readonly speedMultiplier: number }>({
    name: 'minecraft:behavior.run_around_like_crazy',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({ speedMultiplier: numberAt(body, 'speed_multiplier', 1.2) })),
    create: (params, support) => {
        const walk = walkTo(support, {
            find: () => support.navigator.randomTarget(5, 4, () => support.random()),
            speedMultiplier: params.speedMultiplier,
            interval: 0,
            goalRadius: DEFAULT_GOAL_RADIUS
        });
        return {
            ...walk,
            canStart: () => {
                if (support.flag('is_tamed')) return false;
                if ((support.world.riders?.() ?? []).length === 0) return false;
                return walk.canStart?.() ?? false;
            },
            tick: () => {
                walk.tick?.();
                if (!support.chance(1 / 50)) return;
                const [rider] = support.world.riders?.() ?? [];
                if (rider === undefined) return;
                if (rider.identifier?.() === 'minecraft:player' && buckMount(support.entity) === true) {
                    support.world.tameBy?.(rider);
                    return;
                }
                support.world.ejectRiders?.();
            }
        };
    }
});

/**
 * `minecraft:behavior.scared`, which the panda carries. The entity freezes
 * during a thunderstorm instead of going about its business.
 */
export const scared = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.scared',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => support.worldView()?.weather?.() === 'thunder',
        canContinue: () => support.worldView()?.weather?.() === 'thunder',
        start: () => {
            support.navigator.stop();
        }
    })
});

/**
 * `minecraft:behavior.open_door`, which the villager carries.
 *
 * Java's `OpenDoorGoal` closes the door 20 ticks after passing through when
 * `close_door_after` is set, which is the `forgetTime` of its parent
 * `DoorInteractGoal`.
 */
export const openDoor = goal<{ readonly closeDoorAfter: boolean }>({
    name: 'minecraft:behavior.open_door',
    controlFlags: [],
    schema: bodySchema((body) => ({ closeDoorAfter: booleanAt(body, 'close_door_after', true) })),
    create: (params, support) => {
        /** How long the entity remembers to close a door, from Java's `DoorInteractGoal`. */
        const forgetTicks = 20;
        let remaining = 0;
        let door: EntityPosition | undefined;

        return {
            canStart: () => {
                const view = support.navigation();
                if (view?.doorAt === undefined) return false;
                const here = support.position();
                for (const [dx, dz] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1]
                ]) {
                    const candidate = {
                        x: Math.floor(here.x) + (dx ?? 0),
                        y: Math.floor(here.y),
                        z: Math.floor(here.z) + (dz ?? 0)
                    };
                    const state = view.doorAt(candidate);
                    if (state === undefined || state.open || state.iron) continue;
                    door = candidate;
                    return true;
                }
                return false;
            },
            canContinue: () => params.closeDoorAfter && remaining > 0,
            start: () => {
                if (door !== undefined) support.world.setBlock?.(door, 'minecraft:open_door');
                remaining = forgetTicks;
            },
            tick: () => {
                remaining -= 1;
            },
            stop: () => {
                if (params.closeDoorAfter && door !== undefined)
                    support.world.setBlock?.(door, 'minecraft:closed_door');
                door = undefined;
                remaining = 0;
            }
        };
    }
});

/**
 * `minecraft:behavior.restrict_open_door`, which the villager carries. It
 * keeps the entity from opening doors at night, which is what sends villagers
 * indoors rather than out.
 */
export const restrictOpenDoor = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.restrict_open_door',
    controlFlags: [],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => support.isNight()
    })
});

/**
 * `minecraft:behavior.stay_near_noteblock`, which the allay carries. The
 * note block it heard last is its anchor until it hears another.
 */
export const stayNearNoteblock = goal<{
    readonly speed: number;
    readonly startDistance: number;
    readonly stopDistance: number;
}>({
    name: 'minecraft:behavior.stay_near_noteblock',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speed: numberAt(body, 'speed', 1),
        startDistance: numberAt(body, 'start_distance', 16),
        stopDistance: numberAt(body, 'stop_distance', 2)
    })),
    create: (params, support) =>
        walkTo(support, {
            find: () => {
                const anchor = support.world.poi?.('noteblock', params.startDistance);
                if (anchor === undefined) return undefined;
                return support.distanceTo(anchor) > params.stopDistance ? anchor : undefined;
            },
            speedMultiplier: params.speed,
            interval: 0,
            goalRadius: params.stopDistance
        })
});

/** Every goal in the movement family. */
export const movementGoals: readonly RegisterableGoal[] = [
    randomStroll,
    randomSwim,
    randomFly,
    randomHover,
    floatWander,
    swimWander,
    swimIdle,
    float,
    slimeFloat,
    riseToLiquidLevel,
    panic,
    avoidMobType,
    avoidBlock,
    fleeSun,
    findCover,
    moveToBlock,
    moveToWater,
    moveToLand,
    moveToLiquid,
    moveToRandomBlock,
    moveTowardsHomeRestriction,
    moveTowardsDwellingRestriction,
    goHome,
    moveToVillage,
    strollTowardsVillage,
    moveThroughVillage,
    moveIndoors,
    moveOutdoors,
    exploreOutskirts,
    investigateSuspiciousLocation,
    findUnderwaterTreasure,
    circleAroundAnchor,
    jumpToBlock,
    swimUpForBreath,
    swimWithEntity,
    followMob,
    followCaravan,
    followTargetCaptain,
    mountPathing,
    runAroundLikeCrazy,
    scared,
    openDoor,
    restrictOpenDoor,
    stayNearNoteblock
];
