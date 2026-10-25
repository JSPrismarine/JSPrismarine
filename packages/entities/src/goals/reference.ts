import { accepted, rejected } from '@jsprismarine/content';

import type { EntityInstance } from '../entityInstance';
import type { GoalFactory } from '../goals';
import type { EntityPosition } from '../hooks';
import { TICKS_PER_SECOND } from '../hooks';
import { isRecord, numberAt } from '../components/schemas';

/**
 * Three goals, written to prove the scheduler and to show the shape the other
 * 167 take.
 *
 * Each one holds a different control flag, so a test can watch the scheduler
 * hand out `jump`, `move` and `look` independently and preempt by priority.
 */

/** What `minecraft:behavior.float` declares. */
export interface FloatParams {
    /** The chance per tick of swimming up while in a liquid, in [0, 1]. */
    readonly chancePerTickToFloat: number;
}

/**
 * `minecraft:behavior.float`, which keeps an entity at the surface of water
 * or lava. 49 vanilla entities carry it, 40 of them at priority 0.
 */
export const float: GoalFactory<FloatParams> = {
    name: 'minecraft:behavior.float',
    controlFlags: ['jump'],
    schema: (value) =>
        isRecord(value)
            ? accepted({ chancePerTickToFloat: numberAt(value, 'chance_per_tick_to_float', 0.8) })
            : rejected('expected an object'),
    create: (params, entity) => ({
        canStart: () => inLiquid(entity),
        tick: () => {
            if (entity.random.next() <= params.chancePerTickToFloat) entity.actuator?.jump();
        }
    })
};

const inLiquid = (entity: EntityInstance): boolean => {
    const self = entity.filterContext().self;
    return self.flag?.('in_water') === true || self.flag?.('in_lava') === true;
};

/** What `minecraft:behavior.random_stroll` declares. */
export interface RandomStrollParams {
    readonly speedMultiplier: number;
    readonly xzDistance: number;
    readonly yDistance: number;
    /** One in this many ticks, the goal looks for somewhere to walk. */
    readonly interval: number;
}

/** How many ticks one stroll walks before the goal gives the move flag back. */
const STROLL_TICKS = 60;

/**
 * `minecraft:behavior.random_stroll`, the wander 64 vanilla entities carry.
 * It takes the move flag for one walk and gives it back when the walk ends.
 */
export const randomStroll: GoalFactory<RandomStrollParams> = {
    name: 'minecraft:behavior.random_stroll',
    controlFlags: ['move'],
    schema: (value) =>
        isRecord(value)
            ? accepted({
                  speedMultiplier: numberAt(value, 'speed_multiplier', 1),
                  xzDistance: numberAt(value, 'xz_dist', 10),
                  yDistance: numberAt(value, 'y_dist', 7),
                  interval: numberAt(value, 'interval', 120)
              })
            : rejected('expected an object'),
    create: (params, entity) => {
        let target: EntityPosition | undefined;
        let remaining = 0;
        return {
            canStart: () => {
                if (params.interval > 0 && entity.random.next() * params.interval >= 1) return false;
                target = entity.actuator?.randomTarget(params.xzDistance, params.yDistance);
                return target !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = STROLL_TICKS;
                if (target !== undefined) entity.actuator?.moveTo(target, params.speedMultiplier);
            },
            tick: () => {
                remaining -= 1;
            },
            stop: () => {
                remaining = 0;
                entity.actuator?.stopMoving();
            }
        };
    }
};

/** What `minecraft:behavior.look_at_player` declares. */
export interface LookAtPlayerParams {
    /** How far the entity notices a player, in blocks. */
    readonly lookDistance: number;
    /** The chance per tick of starting to look, in [0, 1]. */
    readonly probability: number;
    /** How long one look lasts, in seconds, as a `[min, max]` pair. */
    readonly lookTime: readonly [number, number];
}

/**
 * `minecraft:behavior.look_at_player`, the most used goal in the vanilla pack:
 * 69 of the 129 entities carry it, usually at priority 7 to 9 with a
 * probability of 0.02.
 */
export const lookAtPlayer: GoalFactory<LookAtPlayerParams> = {
    name: 'minecraft:behavior.look_at_player',
    controlFlags: ['look'],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        const lookTime = Array.isArray(value.look_time)
            ? value.look_time.filter((part): part is number => typeof part === 'number')
            : [];
        return accepted({
            lookDistance: numberAt(value, 'look_distance', 8),
            probability: numberAt(value, 'probability', 0.02),
            lookTime: [lookTime[0] ?? 2, lookTime[1] ?? 4] as const
        });
    },
    create: (params, entity) => {
        let remaining = 0;
        return {
            canStart: () => {
                if (entity.random.next() >= params.probability) return false;
                return entity.actuator?.nearestPlayer(params.lookDistance) !== undefined;
            },
            canContinue: () => remaining > 0 && entity.actuator?.nearestPlayer(params.lookDistance) !== undefined,
            start: () => {
                const [min, max] = params.lookTime;
                remaining = Math.round((min + entity.random.next() * (max - min)) * TICKS_PER_SECOND);
            },
            tick: () => {
                remaining -= 1;
                const player = entity.actuator?.nearestPlayer(params.lookDistance);
                if (player !== undefined) entity.actuator?.lookAt(player);
            },
            stop: () => {
                remaining = 0;
            }
        };
    }
};

/** The goals this package ships. A later agent adds the other 167. */
export const referenceGoals = [float, randomStroll, lookAtPlayer] as const;
