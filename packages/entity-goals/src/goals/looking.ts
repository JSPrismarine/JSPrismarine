import type { Goal } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';

import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import type { GoalBody, Range } from '../params';
import { bodySchema, booleanAt, filterAt, numberAt, tickRangeAt } from '../params';
import type { GoalSupport } from '../support';
import type { GoalMob } from '../world';

/**
 * The goals that only turn the entity's head.
 *
 * All six hold the `look` flag and nothing else, and they are the most common
 * goals in the pack: `look_at_player` is on 69 of the 129 entities and
 * `random_look_around` on 55. The constants are Java's: `LookAtPlayerGoal`
 * publishes `DEFAULT_PROBABILITY = 0.02F` and looks for 40 to 80 ticks, and
 * `RandomLookAroundGoal` starts on the same 0.02 chance and looks for 20 to 40.
 */

/** The chance per tick a look starts, from Java's `LookAtPlayerGoal.DEFAULT_PROBABILITY`. */
const LOOK_PROBABILITY = 0.02;

/** How long one look lasts, in ticks, from Java's `LookAtPlayerGoal.start`. */
const LOOK_TICKS: Range = [40, 80];

/** How long a random look lasts, in ticks, from Java's `RandomLookAroundGoal.start`. */
const GLANCE_TICKS: Range = [20, 40];

/** The shared loop: pick something to look at, hold the look for a drawn time. */
const lookLoop = (
    support: GoalSupport,
    options: {
        find(): GoalMob | undefined;
        readonly probability: number;
        readonly lookTime: Range;
    }
): Goal => {
    let subject: GoalMob | undefined;
    let remaining = 0;

    return {
        canStart: () => {
            if (!support.chance(options.probability)) return false;
            subject = options.find();
            return subject !== undefined;
        },
        canContinue: () => remaining > 0 && subject !== undefined,
        start: () => {
            remaining = support.between(options.lookTime[0], options.lookTime[1]);
        },
        tick: () => {
            remaining -= 1;
            if (subject !== undefined) support.lookAtMob(subject);
        },
        stop: () => {
            remaining = 0;
            subject = undefined;
        }
    };
};

/** What the look goals declare. */
export interface LookAtParams {
    /** How far the entity notices something to look at, in blocks. */
    readonly lookDistance: number;
    /** The chance per tick of starting a look, in [0, 1]. */
    readonly probability: number;
    /** How long one look lasts, in ticks. */
    readonly lookTime: Range;
    /** How wide the entity's horizontal field of view is, in degrees. */
    readonly angleOfViewHorizontal: number;
    /** How wide its vertical field of view is, in degrees. */
    readonly angleOfViewVertical: number;
}

const lookAtFrom = (body: GoalBody): LookAtParams => ({
    lookDistance: numberAt(body, 'look_distance', 8),
    probability: numberAt(body, 'probability', LOOK_PROBABILITY),
    lookTime: tickRangeAt(body, 'look_time', [LOOK_TICKS[0] / 20, LOOK_TICKS[1] / 20]),
    angleOfViewHorizontal: numberAt(body, 'angle_of_view_horizontal', 360),
    angleOfViewVertical: numberAt(body, 'angle_of_view_vertical', 360)
});

const readLookAt = bodySchema(lookAtFrom);

/**
 * `minecraft:behavior.look_at_player`, the most used goal in the vanilla pack:
 * 69 of the 129 entities carry it, usually at priority 7 to 9 with a
 * probability of 0.02.
 */
export const lookAtPlayer = goal<LookAtParams>({
    name: 'minecraft:behavior.look_at_player',
    controlFlags: ['look'],
    schema: readLookAt,
    create: (params, support) =>
        lookLoop(support, {
            find: () => support.nearestPlayer(params.lookDistance),
            probability: params.probability,
            lookTime: params.lookTime
        })
});

/** What `minecraft:behavior.look_at_entity` declares. */
export interface LookAtEntityParams extends LookAtParams {
    /** Which entities are worth looking at. */
    readonly filters: Filter | undefined;
}

/**
 * `minecraft:behavior.look_at_entity`, which four vanilla entities carry. It
 * is `look_at_player` with a filter instead of a fixed subject type.
 */
export const lookAtEntity = goal<LookAtEntityParams>({
    name: 'minecraft:behavior.look_at_entity',
    controlFlags: ['look'],
    schema: bodySchema((body) => ({ ...lookAtFrom(body), filters: filterAt(body, 'filters') })),
    create: (params, support) =>
        lookLoop(support, {
            find: () => support.mobs(params.lookDistance).find((mob) => support.matches(params.filters, mob)),
            probability: params.probability,
            lookTime: params.lookTime
        })
});

/**
 * `minecraft:behavior.look_at_target`, which the warden carries. It watches
 * whatever the targeting goals chose rather than looking for a subject.
 */
export const lookAtTarget = goal<LookAtParams>({
    name: 'minecraft:behavior.look_at_target',
    controlFlags: ['look'],
    schema: readLookAt,
    create: (params, support) =>
        lookLoop(support, {
            find: () => support.target(),
            probability: 1,
            lookTime: params.lookTime
        })
});

/**
 * `minecraft:behavior.look_at_trading_player`, which the three trader
 * entities carry. It holds the head on whoever has the trade screen open, so
 * it never ends on its own.
 */
export const lookAtTradingPlayer = goal<LookAtParams>({
    name: 'minecraft:behavior.look_at_trading_player',
    controlFlags: ['look'],
    schema: readLookAt,
    create: (params, support) =>
        lookLoop(support, {
            find: () => support.world.tradingPlayer?.(),
            probability: 1,
            lookTime: params.lookTime
        })
});

/** What `minecraft:behavior.random_look_around` declares. */
export interface RandomLookAroundParams {
    /** How far the entity looks, in blocks. */
    readonly lookDistance: number;
    /** How long one glance lasts, in ticks. */
    readonly lookTime: Range;
}

/**
 * `minecraft:behavior.random_look_around`, which 55 vanilla entities carry.
 *
 * Java's `RandomLookAroundGoal` picks a direction on the unit circle, looks
 * there for 20 to 40 ticks and starts on a 0.02 chance per tick.
 */
export const randomLookAround = goal<RandomLookAroundParams>({
    name: 'minecraft:behavior.random_look_around',
    controlFlags: ['look'],
    schema: bodySchema((body) => ({
        lookDistance: numberAt(body, 'look_distance', 8),
        lookTime: tickRangeAt(body, 'look_time', [GLANCE_TICKS[0] / 20, GLANCE_TICKS[1] / 20])
    })),
    create: (params, support) => {
        let remaining = 0;
        let direction = { x: 0, y: 0, z: 0 };

        return {
            canStart: () => support.chance(LOOK_PROBABILITY),
            canContinue: () => remaining > 0,
            start: () => {
                const angle = support.random() * Math.PI * 2;
                const here = support.position();
                direction = {
                    x: here.x + Math.cos(angle) * params.lookDistance,
                    y: here.y,
                    z: here.z + Math.sin(angle) * params.lookDistance
                };
                remaining = support.between(params.lookTime[0], params.lookTime[1]);
            },
            tick: () => {
                remaining -= 1;
                support.lookAt(direction);
            },
            stop: () => {
                remaining = 0;
            }
        };
    }
});

/** What `minecraft:behavior.random_look_around_and_sit` declares. */
export interface RandomLookAroundAndSitParams {
    /** How many glances one sitting takes. */
    readonly lookCount: Range;
    /** How long each glance lasts, in ticks. */
    readonly lookTime: Range;
    /** How wide the glances spread, in degrees. */
    readonly angleOfView: Range;
    /** The chance per tick of sitting down, in [0, 1]. */
    readonly probability: number;
    /** How long before the goal may run again, in ticks. */
    readonly cooldown: number;
    readonly continueIfLeashed: boolean;
    readonly continueSittingOnReload: boolean;
}

/**
 * `minecraft:behavior.random_look_around_and_sit`, which the panda, the fox
 * and the goat carry. The entity sits, takes a few glances and stands up.
 */
export const randomLookAroundAndSit = goal<RandomLookAroundAndSitParams>({
    name: 'minecraft:behavior.random_look_around_and_sit',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        lookCount: [numberAt(body, 'min_look_count', 1), numberAt(body, 'max_look_count', 2)] as const,
        lookTime: [numberAt(body, 'min_look_time', 20), numberAt(body, 'max_look_time', 40)] as const,
        angleOfView: [
            numberAt(body, 'min_angle_of_view_horizontal', -30),
            numberAt(body, 'max_angle_of_view_horizontal', 30)
        ] as const,
        probability: numberAt(body, 'probability', 0.02),
        cooldown: numberAt(body, 'random_look_around_cooldown', 0),
        continueIfLeashed: booleanAt(body, 'continue_if_leashed', false),
        continueSittingOnReload: booleanAt(body, 'continue_sitting_on_reload', false)
    })),
    create: (params, support) => {
        let glances = 0;
        let remaining = 0;
        let cooldown = 0;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                if (!params.continueIfLeashed && support.flag('is_leashed')) return false;
                return support.chance(params.probability);
            },
            canContinue: () => glances > 0,
            start: () => {
                glances = support.between(params.lookCount[0], params.lookCount[1]);
                remaining = support.between(params.lookTime[0], params.lookTime[1]);
                support.navigator.stop();
                support.world.setSitting?.(true);
            },
            tick: () => {
                if ((remaining -= 1) > 0) return;
                glances -= 1;
                remaining = support.between(params.lookTime[0], params.lookTime[1]);
                const spread = params.angleOfView[1] - params.angleOfView[0];
                const angle = ((params.angleOfView[0] + support.random() * spread) * Math.PI) / 180;
                const here = support.position();
                support.lookAt({ x: here.x + Math.cos(angle) * 4, y: here.y, z: here.z + Math.sin(angle) * 4 });
            },
            stop: () => {
                glances = 0;
                cooldown = params.cooldown;
                support.world.setSitting?.(false);
            }
        };
    }
});

/** Every goal in the looking family. */
export const lookingGoals: readonly RegisterableGoal[] = [
    lookAtPlayer,
    lookAtEntity,
    lookAtTarget,
    lookAtTradingPlayer,
    randomLookAround,
    randomLookAroundAndSit
];
