import type { EntityPosition, Goal } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';

import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import type { GoalBody, GoalEvent, Range } from '../params';
import {
    bodySchema,
    booleanAt,
    eventAt,
    eventsAt,
    filterAt,
    isRecord,
    numberAt,
    rangeAt,
    recordsAt,
    stringAt,
    stringsAt,
    tickRangeAt,
    ticksAt
} from '../params';
import type { GoalSupport } from '../support';
import type { GoalMob } from '../world';
import { slimeHeadingOf } from './slimeHeading';

/**
 * The goals that hurt the entity's target.
 *
 * They all read the target the targeting goals set and hold `move` and
 * `look`, so one of them runs at a time. The melee cadence of one swing every
 * 20 ticks and the re-path interval of 10 ticks are Java's
 * `MeleeAttackGoal.attackInterval` and `ticksUntilNextPathRecalculation`.
 */

/** How long between melee swings when the body names no cooldown, from Java's `MeleeAttackGoal`. */
const MELEE_COOLDOWN = 20;

/** One selector tick in this many starts a leap: Java's `LeapAtTargetGoal` draws `reducedTickDelay(5)`. */
const LEAP_INTERVAL = Math.ceil(5 / 2);

/** How often a chasing goal recomputes its path, from Java's `MeleeAttackGoal`. */
const REPATH_INTERVAL = 10;

/** How far a melee swing reaches before `reach_multiplier`, in blocks. */
const MELEE_REACH = 2;

/** The shared chase-and-swing loop the melee goals are built from. */
interface MeleeOptions {
    readonly speedMultiplier: number;
    /** How long between swings, in ticks. */
    readonly cooldown: number;
    /** How far a swing reaches, in blocks. */
    readonly reach: number;
    /** Whether the goal keeps chasing a target it cannot see. */
    readonly trackTarget: boolean;
    /** Whether one swing ends the goal. */
    readonly attackOnce: boolean;
    /** One tick in this many ends the goal early; 0 never does. */
    readonly randomStopInterval: number;
    /** Whether the goal refuses to start without a complete path to the target. */
    readonly requireCompletePath: boolean;
    /** Ticks between the swing starting and the damage landing. */
    readonly hitDelay: number;
    readonly onAttack: GoalEvent | undefined;
}

/**
 * The loop `melee_attack`, `melee_box_attack` and `delayed_attack` share:
 * walk to the target, look at it, and swing whenever the cooldown is up and
 * the target is in reach.
 */
const meleeLoop = (support: GoalSupport, options: MeleeOptions): Goal => {
    let target: GoalMob | undefined;
    let cooldown = 0;
    let repath = 0;
    let pending = -1;
    let swung = false;

    const strike = (mob: GoalMob): void => {
        support.world.attack?.(mob);
        support.fire(options.onAttack, mob);
        swung = true;
    };

    return {
        canStart: () => {
            target = support.target();
            if (target === undefined) return false;
            if (options.requireCompletePath && !support.navigator.canReach(target.position(), 1)) return false;
            return true;
        },
        canContinue: () => {
            const current = support.target();
            if (current === undefined || target === undefined || current.id !== target.id) return false;
            if (options.attackOnce && swung) return false;
            if (options.randomStopInterval > 0 && support.chance(1 / options.randomStopInterval)) return false;
            if (!options.trackTarget && !support.canSee(current)) return false;
            return true;
        },
        start: () => {
            cooldown = 0;
            // The scheduler ticks a newly started goal immediately, so leave
            // the interval set for that tick after queuing this first path.
            repath = REPATH_INTERVAL + 1;
            pending = -1;
            swung = false;
            if (target !== undefined) support.navigator.moveTo(target.position(), options.speedMultiplier, 1);
        },
        tick: () => {
            const current = target;
            if (current === undefined) return;
            const where = current.position();
            support.lookAtMob(current);

            if ((repath -= 1) <= 0) {
                repath = REPATH_INTERVAL;
                support.navigator.moveTo(where, options.speedMultiplier, 1);
            } else {
                support.navigator.tick();
            }

            if (pending >= 0) {
                pending -= 1;
                if (pending < 0) strike(current);
                return;
            }

            cooldown = Math.max(0, cooldown - 1);
            if (cooldown > 0 || support.distanceTo(where) > options.reach) return;
            cooldown = options.cooldown;
            if (options.hitDelay > 0) pending = options.hitDelay;
            else strike(current);
        },
        stop: () => {
            support.navigator.stop();
            target = undefined;
        },
        requiresUpdateEveryTick: () => true
    };
};

/** What the melee goals declare. */
export interface MeleeAttackParams {
    readonly speedMultiplier: number;
    readonly trackTarget: boolean;
    readonly attackOnce: boolean;
    readonly requireCompletePath: boolean;
    readonly randomStopInterval: number;
    /** How long between swings, in ticks. */
    readonly cooldownTime: number;
    /** How far a swing reaches, as a multiple of the entity's width. */
    readonly reachMultiplier: number;
    /** How wide the swing arc is, in degrees. */
    readonly meleeFov: number;
    readonly canSpreadOnFire: boolean;
    readonly onAttack: GoalEvent | undefined;
    readonly onKill: GoalEvent | undefined;
}

const meleeFrom = (body: GoalBody): MeleeAttackParams => ({
    speedMultiplier: numberAt(body, 'speed_multiplier', 1),
    trackTarget: booleanAt(body, 'track_target', false),
    attackOnce: booleanAt(body, 'attack_once', false),
    requireCompletePath: booleanAt(body, 'require_complete_path', false),
    randomStopInterval: numberAt(body, 'random_stop_interval', 0),
    cooldownTime: ticksAt(body, 'cooldown_time', MELEE_COOLDOWN / 20),
    reachMultiplier: numberAt(body, 'reach_multiplier', 2),
    meleeFov: numberAt(body, 'melee_fov', 90),
    canSpreadOnFire: booleanAt(body, 'can_spread_on_fire', false),
    onAttack: eventAt(body, 'on_attack'),
    onKill: eventAt(body, 'on_kill')
});

const readMeleeAttack = bodySchema(meleeFrom);

const meleeOptions = (params: MeleeAttackParams, hitDelay = 0): MeleeOptions => ({
    speedMultiplier: params.speedMultiplier,
    cooldown: params.cooldownTime,
    reach: MELEE_REACH * (params.reachMultiplier / 2),
    trackTarget: params.trackTarget,
    attackOnce: params.attackOnce,
    randomStopInterval: params.randomStopInterval,
    requireCompletePath: params.requireCompletePath,
    hitDelay,
    onAttack: params.onAttack
});

/**
 * `minecraft:behavior.melee_box_attack`, the attack 32 vanilla entities carry.
 *
 * Bedrock splits melee in two: this one tests the entity's collision box
 * against the target's, and `melee_attack` tests the distance. The difference
 * does not survive into a server with no collision boxes in the goal seam, so
 * both run the same loop and `reach_multiplier` is the only thing that varies.
 */
export const meleeBoxAttack = goal<MeleeAttackParams>({
    name: 'minecraft:behavior.melee_box_attack',
    controlFlags: ['move', 'look'],
    schema: readMeleeAttack,
    create: (params, support) => meleeLoop(support, meleeOptions(params))
});

/**
 * `minecraft:behavior.melee_attack`, which the hoglin carries.
 *
 * Java's `MeleeAttackGoal` is the same goal and is where the 20-tick swing
 * cadence and the 10-tick re-path interval come from.
 */
export const meleeAttack = goal<MeleeAttackParams>({
    name: 'minecraft:behavior.melee_attack',
    controlFlags: ['move', 'look'],
    schema: readMeleeAttack,
    create: (params, support) => meleeLoop(support, meleeOptions(params))
});

/** What `minecraft:behavior.delayed_attack` declares. */
export interface DelayedAttackParams extends MeleeAttackParams {
    /** How long one swing takes, in ticks. */
    readonly attackDuration: number;
    /** How far into the swing the damage lands, in [0, 1]. */
    readonly hitDelayPercent: number;
}

/**
 * `minecraft:behavior.delayed_attack`, which the ravager carries.
 *
 * It is the melee loop with the damage landing part way into the swing rather
 * than at its start, which is what `hit_delay_pct` of `attack_duration`
 * measures.
 */
export const delayedAttack = goal<DelayedAttackParams>({
    name: 'minecraft:behavior.delayed_attack',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        ...meleeFrom(body),
        attackDuration: ticksAt(body, 'attack_duration', 0.75),
        hitDelayPercent: numberAt(body, 'hit_delay_pct', 0.5)
    })),
    create: (params, support) =>
        meleeLoop(support, meleeOptions(params, Math.round(params.attackDuration * params.hitDelayPercent)))
});

/** What `minecraft:behavior.ranged_attack` declares. */
export interface RangedAttackParams {
    readonly speedMultiplier: number;
    /** How far the entity shoots from, in blocks. */
    readonly attackRadius: number;
    /** How close it refuses to shoot from, in blocks. */
    readonly attackRadiusMin: number;
    /** How long between shots, in ticks, as a `[min, max]` pair. */
    readonly attackInterval: Range;
    /**
     * Bedrock's range the target may be in for the goal to run, in blocks. The goal reads it but
     * does not gate on it: Java's ranged goals start with any target and walk in.
     */
    readonly attackRange: Range;
    /** How long the target has to stay in sight before the first shot, in ticks. */
    readonly targetInSightTime: number;
    /** How many shots one volley fires. */
    readonly burstShots: number;
    /** How long between the shots of one volley, in ticks. */
    readonly burstInterval: number;
    /** When the entity starts the charge animation, in ticks before the shot. */
    readonly chargeShootTrigger: number;
    /** When a charged weapon counts as charged, in ticks. */
    readonly chargeChargedTrigger: number;
    readonly swing: boolean;
}

/**
 * `minecraft:behavior.ranged_attack`, which 14 vanilla entities carry.
 *
 * `attack_interval` is the key with two spellings in vanilla: eight files
 * write `{"range_min": a, "range_max": b}` in seconds and five write the pair
 * as `attack_interval_min` and `attack_interval_max`, so both are read.
 * Java's `RangedAttackGoal` keeps a sight timer before the first shot, which
 * `target_in_sight_time` is the Bedrock spelling of.
 *
 * It starts with any target, however far, as Java's `RangedAttackGoal`,
 * `RangedBowAttackGoal` and `RangedCrossbowAttackGoal` do, and walks toward
 * it until it is within `attack_radius`, where it holds its ground and shoots.
 */
export const rangedAttack = goal<RangedAttackParams>({
    name: 'minecraft:behavior.ranged_attack',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => {
        const paired = tickRangeAt(body, 'attack_interval', [1, 1]);
        const min = body.attack_interval_min === undefined ? paired[0] : ticksAt(body, 'attack_interval_min', 1);
        const max = body.attack_interval_max === undefined ? paired[1] : ticksAt(body, 'attack_interval_max', 1);
        return {
            speedMultiplier: numberAt(body, 'speed_multiplier', 1),
            attackRadius: numberAt(body, 'attack_radius', 16),
            attackRadiusMin: numberAt(body, 'attack_radius_min', 0),
            attackInterval: [min, max] as const,
            attackRange: rangeAt(body, 'attack_range', [0, numberAt(body, 'attack_radius', 16)]),
            targetInSightTime: ticksAt(body, 'target_in_sight_time', 0),
            burstShots: numberAt(body, 'burst_shots', 1),
            burstInterval: ticksAt(body, 'burst_interval', 0),
            chargeShootTrigger: ticksAt(body, 'charge_shoot_trigger', 0),
            chargeChargedTrigger: ticksAt(body, 'charge_charged_trigger', 0),
            swing: booleanAt(body, 'swing', false)
        };
    }),
    create: (params, support) => {
        let target: GoalMob | undefined;
        let cooldown = 0;
        let sighted = 0;
        let burst = 0;

        return {
            canStart: () => {
                target = support.target();
                return target !== undefined;
            },
            canContinue: () => {
                const current = support.target();
                return current !== undefined && target !== undefined && current.id === target.id;
            },
            start: () => {
                cooldown = params.attackInterval[0];
                sighted = 0;
                burst = 0;
            },
            tick: () => {
                const current = target;
                if (current === undefined) return;
                const where = current.position();
                const range = support.distanceTo(where);
                support.lookAtMob(current);

                if (range > params.attackRadius) support.navigator.moveTo(where, params.speedMultiplier, 1);
                else if (range < params.attackRadiusMin)
                    support.navigator.moveTo(support.position(), params.speedMultiplier, 1);
                else support.navigator.stop();

                if (!support.canSee(current)) {
                    sighted = 0;
                    return;
                }
                sighted += 1;
                if (sighted < params.targetInSightTime) return;

                if ((cooldown -= 1) > 0) return;
                support.world.shoot?.(current, undefined);
                burst += 1;
                cooldown =
                    burst < params.burstShots
                        ? Math.max(1, params.burstInterval)
                        : support.between(params.attackInterval[0], params.attackInterval[1]);
                if (burst >= params.burstShots) burst = 0;
            },
            stop: () => {
                support.navigator.stop();
                target = undefined;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.fire_at_target` declares. */
export interface FireAtTargetParams {
    /** How long between shots, in ticks. */
    readonly attackCooldown: number;
    /** How far the target may be for the goal to fire, in blocks. */
    readonly attackRange: Range;
    /** The projectile entity to create. */
    readonly projectile: string | undefined;
    /** How long the entity aims before the shot, in ticks. */
    readonly preShootDelay: number;
    /** How long the entity holds the pose after the shot, in ticks. */
    readonly postShootDelay: number;
    /** How wide the firing arc is, in degrees. */
    readonly rangedFov: number;
}

/**
 * `minecraft:behavior.fire_at_target`, which the breeze carries.
 *
 * Unlike `ranged_attack` it never closes the distance: it aims, waits out
 * `pre_shoot_delay`, creates the `projectile_def` entity and waits out
 * `post_shoot_delay`.
 */
export const fireAtTarget = goal<FireAtTargetParams>({
    name: 'minecraft:behavior.fire_at_target',
    controlFlags: ['look'],
    schema: bodySchema((body) => ({
        attackCooldown: ticksAt(body, 'attack_cooldown', 1),
        attackRange: rangeAt(body, 'attack_range', [1, 16]),
        projectile: stringAt(body, 'projectile_def'),
        preShootDelay: ticksAt(body, 'pre_shoot_delay', 0),
        postShootDelay: ticksAt(body, 'post_shoot_delay', 0),
        rangedFov: numberAt(body, 'ranged_fov', 90)
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        let phase = 0;

        return {
            canStart: () => {
                target = support.target();
                if (target === undefined) return false;
                const range = support.distanceTo(target.position());
                return range >= params.attackRange[0] && range <= params.attackRange[1];
            },
            canContinue: () => phase > 0 && support.target() !== undefined,
            start: () => {
                phase = params.preShootDelay + params.postShootDelay + 1;
            },
            tick: () => {
                const current = target;
                if (current === undefined) return;
                support.lookAtMob(current);
                phase -= 1;
                if (phase === params.postShootDelay) support.world.shoot?.(current, params.projectile);
            },
            stop: () => {
                phase = 0;
                target = undefined;
            }
        };
    }
});

/** What a charge-style attack declares. */
export interface ChargeAttackParams {
    /** How fast the entity charges, as a speed multiplier. */
    readonly chargeSpeed: number;
    /** How far the charge reaches, in blocks. */
    readonly maxChargeDistance: number;
    /** How far past the target the entity runs, in blocks. */
    readonly overshootDistance: number;
    /** How close the charge has to come to connect, in blocks. */
    readonly attackReach: number;
    /** How hard the hit throws the target. */
    readonly knockbackForce: number;
    /** How long between charges, in ticks. */
    readonly cooldown: Range;
}

/**
 * The shared charge loop: close the distance fast, hit once and go on
 * cooldown.
 */
const chargeLoop = (support: GoalSupport, params: ChargeAttackParams): Goal => {
    let target: GoalMob | undefined;
    let cooldown = 0;
    let hit = false;
    // A flier with no path finder, such as the phantom, steers straight at its target the way
    // Java's move controls do, rather than waiting on a path that never comes.
    let direct = false;

    return {
        canStart: () => {
            if (cooldown > 0) {
                cooldown -= 1;
                return false;
            }
            target = support.target();
            return target !== undefined && support.distanceTo(target.position()) <= params.maxChargeDistance;
        },
        canContinue: () => !hit && support.target() !== undefined,
        start: () => {
            hit = false;
            direct = target !== undefined && !support.navigator.moveTo(target.position(), params.chargeSpeed, 1);
        },
        tick: () => {
            const current = target;
            if (current === undefined) return;
            support.lookAtMob(current);
            if (direct) support.actuator?.moveTo(current.position(), params.chargeSpeed);
            else support.navigator.tick();
            if (support.distanceTo(current.position()) > params.attackReach) return;
            support.world.attack?.(current);
            if (params.knockbackForce > 0) support.world.knockback?.(current, params.knockbackForce, 0);
            hit = true;
        },
        stop: () => {
            support.navigator.stop();
            cooldown = support.between(params.cooldown[0], params.cooldown[1]);
            target = undefined;
        }
    };
};

/** Reads a charge body, with the defaults of the goal that declares it. */
const chargeFrom = (body: GoalBody, defaults: Partial<ChargeAttackParams> = {}): ChargeAttackParams => ({
    chargeSpeed: numberAt(body, 'charge_speed', defaults.chargeSpeed ?? 1.5),
    maxChargeDistance: numberAt(body, 'max_charge_distance', defaults.maxChargeDistance ?? 16),
    overshootDistance: numberAt(body, 'charge_overshoot_distance', defaults.overshootDistance ?? 1),
    attackReach: numberAt(body, 'attack_reach', defaults.attackReach ?? 2),
    knockbackForce: numberAt(body, 'knockback_force', defaults.knockbackForce ?? 0),
    cooldown: tickRangeAt(body, 'charge_cooldown_time', [1, 1])
});

const readCharge = (defaults: Partial<ChargeAttackParams> = {}) =>
    bodySchema((body): ChargeAttackParams => chargeFrom(body, defaults));

/**
 * `minecraft:behavior.charge_attack`, which the vex carries. It rushes the
 * target in a straight line and goes on cooldown after the hit.
 */
export const chargeAttack = goal<ChargeAttackParams>({
    name: 'minecraft:behavior.charge_attack',
    controlFlags: ['move', 'look'],
    schema: readCharge(),
    create: (params, support) => chargeLoop(support, params)
});

/**
 * `minecraft:behavior.aquatic_charge_attack`, which the guardian line
 * carries. It is the same charge with the swim speed and knockback the
 * aquatic bodies set.
 */
export const aquaticChargeAttack = goal<ChargeAttackParams>({
    name: 'minecraft:behavior.aquatic_charge_attack',
    controlFlags: ['move', 'look'],
    schema: readCharge({ chargeSpeed: 1 }),
    create: (params, support) => chargeLoop(support, params)
});

/** What `minecraft:behavior.swoop_attack` declares: a charge, and what breaks a swoop off. */
export interface SwoopAttackParams extends ChargeAttackParams {
    /** The mobs whose nearness breaks a swoop off, with each as `other`; absent breaks none. A server key. */
    readonly scaredOf: Filter | undefined;
    /** How far past the entity's box it looks for them, in blocks. A server key. */
    readonly scareRange: number;
}

/** How many game ticks Java's `PhantomSweepAttackGoal` waits between two searches for cats. */
const SCARE_SEARCH_TICKS = 20;

/**
 * `minecraft:behavior.swoop_attack`, which the phantom carries. It is a charge
 * that dives from above, so it keeps the look flag while it falls.
 *
 * Java's `PhantomSweepAttackGoal.canContinueToUse` looks for cats in its box inflated by 16 at
 * most once every 20 ticks, and while one is there it breaks the swoop off, and `stop` drops the
 * target. `scared_of` and `scare_range` carry that rule.
 */
export const swoopAttack = goal<SwoopAttackParams>({
    name: 'minecraft:behavior.swoop_attack',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body): SwoopAttackParams => ({
        ...chargeFrom(body, { chargeSpeed: 1 }),
        scaredOf: filterAt(body, 'scared_of'),
        scareRange: numberAt(body, 'scare_range', 16)
    })),
    create: (params, support) => {
        const charge = chargeLoop(support, params);
        let ticks = 0;
        let nextSearch = 0;
        let scared = false;
        /** Whether a mob it is scared of is in its box inflated by the scare range. */
        const scaredNow = (): boolean => {
            const here = support.position();
            const box = support.entity.componentParams('minecraft:collision_box');
            const half = (isRecord(box) && typeof box.width === 'number' ? box.width : 0.9) / 2;
            const height = isRecord(box) && typeof box.height === 'number' ? box.height : 0.5;
            const reach = half + params.scareRange;
            return support.mobs(Math.hypot(reach, reach, height + params.scareRange)).some((mob) => {
                const there = mob.position();
                return (
                    Math.abs(there.x - here.x) <= reach &&
                    Math.abs(there.z - here.z) <= reach &&
                    there.y >= here.y - params.scareRange &&
                    there.y <= here.y + height + params.scareRange &&
                    support.matches(params.scaredOf, mob)
                );
            });
        };
        return {
            ...charge,
            canContinue: () => {
                if (!(charge.canContinue?.() ?? true)) return false;
                if (params.scaredOf === undefined) return true;
                if (ticks > nextSearch) {
                    nextSearch = ticks + SCARE_SEARCH_TICKS;
                    scared = scaredNow();
                }
                return !scared;
            },
            tick: () => {
                ticks += 1;
                charge.tick?.();
            },
            stop: () => {
                charge.stop?.();
                if (scared) support.setTarget(undefined);
            }
        };
    }
});

/** What `minecraft:behavior.leap_at_target` declares. */
export interface LeapAtTargetParams {
    /** How much upward velocity the leap adds. */
    readonly yd: number;
    /** How close the target may be for the leap to start, in blocks. */
    readonly targetDistance: number;
    readonly mustBeOnGround: boolean;
}

/**
 * `minecraft:behavior.leap_at_target`, which five vanilla entities carry.
 *
 * The conditions are Java's `LeapAtTargetGoal`: the target has to be between 2
 * and 4 blocks away, the entity has to be on the ground, and one tick in five
 * starts the leap. The leap itself adds 0.4 of the direction to the target
 * plus 0.2 of the current velocity, with `yd` upward.
 */
export const leapAtTarget = goal<LeapAtTargetParams>({
    name: 'minecraft:behavior.leap_at_target',
    controlFlags: ['move', 'jump'],
    schema: bodySchema((body) => ({
        yd: numberAt(body, 'yd', 0.4),
        targetDistance: numberAt(body, 'target_dist', 0.3),
        mustBeOnGround: booleanAt(body, 'must_be_on_ground', true)
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        let leaping = false;

        return {
            canStart: () => {
                target = support.target();
                if (target === undefined) return false;
                if (params.mustBeOnGround && !support.flag('on_ground')) return false;
                const range = support.distanceTo(target.position());
                if (range < 2 || range > 4) return false;
                // Java's LeapAtTargetGoal leaps on one selector tick in reducedTickDelay(5).
                return support.randomInt(LEAP_INTERVAL) === 0;
            },
            canContinue: () => leaping && !support.flag('on_ground'),
            start: () => {
                const where = target?.position();
                if (where === undefined) return;
                const here = support.position();
                const dx = where.x - here.x;
                const dz = where.z - here.z;
                const length = Math.hypot(dx, dz) || 1;
                leaping = true;
                support.world.push?.({ x: (dx / length) * 0.4, y: params.yd, z: (dz / length) * 0.4 });
            },
            stop: () => {
                leaping = false;
                target = undefined;
            }
        };
    }
});

/** What `minecraft:behavior.jump_around_target` declares. */
export interface JumpAroundTargetParams {
    /** How long between jumps, in ticks. */
    readonly cooldown: number;
    /** How long between jumps after being hurt, in ticks. */
    readonly hurtCooldown: number;
    /** How long the entity crouches before the jump, in ticks. */
    readonly prepareDuration: number;
    /** How fast the jump throws the entity. */
    readonly maxJumpVelocity: number;
    /** How far from the target the entity lands, in blocks. */
    readonly landingDistance: Range;
    /** How far the target may be for the goal to run, in blocks. */
    readonly validDistance: Range;
}

/**
 * `minecraft:behavior.jump_around_target`, which the breeze carries. It hops
 * to a new position around the target instead of closing in.
 */
export const jumpAroundTarget = goal<JumpAroundTargetParams>({
    name: 'minecraft:behavior.jump_around_target',
    controlFlags: ['move', 'jump'],
    schema: bodySchema((body) => ({
        cooldown: ticksAt(body, 'jump_cooldown_duration', 0.5),
        hurtCooldown: ticksAt(body, 'jump_cooldown_when_hurt_duration', 0.5),
        prepareDuration: ticksAt(body, 'prepare_jump_duration', 0.5),
        maxJumpVelocity: numberAt(body, 'max_jump_velocity', 0.9),
        landingDistance: rangeAt(body, 'landing_distance_from_target', [4, 8]),
        validDistance: rangeAt(body, 'valid_distance_to_target', [4, 24])
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        let prepare = 0;
        let cooldown = 0;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                target = support.target();
                if (target === undefined) return false;
                const range = support.distanceTo(target.position());
                return range >= params.validDistance[0] && range <= params.validDistance[1];
            },
            canContinue: () => prepare > 0,
            start: () => {
                prepare = params.prepareDuration;
            },
            tick: () => {
                const current = target;
                if (current === undefined) return;
                const where = current.position();
                support.lookAtMob(current);
                if ((prepare -= 1) > 0) return;
                const here = support.position();
                const angle = support.random() * Math.PI * 2;
                const distance = support.between(params.landingDistance[0], params.landingDistance[1]);
                const landing = {
                    x: where.x + Math.cos(angle) * distance,
                    y: here.y,
                    z: where.z + Math.sin(angle) * distance
                };
                support.world.push?.({
                    x: (landing.x - here.x) / 10,
                    y: params.maxJumpVelocity,
                    z: (landing.z - here.z) / 10
                });
            },
            stop: () => {
                cooldown = params.cooldown;
                prepare = 0;
                target = undefined;
            }
        };
    }
});

/** What `minecraft:behavior.move_around_target` declares. */
export interface MoveAroundTargetParams {
    /** How far from the target the entity repositions, in blocks. */
    readonly destinationRange: Range;
    /** How wide the arc of candidate positions is, in degrees. */
    readonly spreadDegrees: number;
    /** The most height difference a destination may have, in blocks. */
    readonly heightDifferenceLimit: number;
    readonly movementSpeed: number;
}

/**
 * `minecraft:behavior.move_around_target`, which the breeze carries. It keeps
 * the entity circling its target at a distance rather than closing in.
 */
export const moveAroundTarget = goal<MoveAroundTargetParams>({
    name: 'minecraft:behavior.move_around_target',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        destinationRange: rangeAt(body, 'destination_position_range', [4, 8]),
        spreadDegrees: numberAt(body, 'destination_pos_spread_degrees', 90),
        heightDifferenceLimit: numberAt(body, 'height_difference_limit', 4),
        movementSpeed: numberAt(body, 'movement_speed', 1)
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;

        return {
            canStart: () => {
                target = support.target();
                return target !== undefined;
            },
            canContinue: () => support.navigator.walking && support.target() !== undefined,
            start: () => {
                const where = target?.position();
                if (where === undefined) return;
                const spread = (params.spreadDegrees * Math.PI) / 180;
                const angle = support.random() * spread - spread / 2;
                const distance = support.between(params.destinationRange[0], params.destinationRange[1]);
                support.navigator.moveTo(
                    {
                        x: where.x + Math.cos(angle) * distance,
                        y: where.y,
                        z: where.z + Math.sin(angle) * distance
                    },
                    params.movementSpeed,
                    1
                );
            },
            tick: () => {
                support.navigator.tick();
            },
            stop: () => {
                support.navigator.stop();
                target = undefined;
            }
        };
    }
});

/** What `minecraft:behavior.move_towards_target` declares. */
export interface MoveTowardsTargetParams {
    readonly speedMultiplier: number;
    /** How far the target may be for the goal to run, in blocks. */
    readonly withinRadius: number;
}

/**
 * `minecraft:behavior.move_towards_target`, which the iron golem carries.
 *
 * Java's `MoveTowardsTargetGoal` runs while the target stays inside the radius
 * and stops when the navigation finishes, which is the shape here.
 */
export const moveTowardsTarget = goal<MoveTowardsTargetParams>({
    name: 'minecraft:behavior.move_towards_target',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        withinRadius: numberAt(body, 'within_radius', 16)
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        return {
            canStart: () => {
                target = support.target();
                return target !== undefined && support.distanceTo(target.position()) <= params.withinRadius;
            },
            canContinue: () => {
                const current = support.target();
                return (
                    current !== undefined &&
                    support.navigator.walking &&
                    support.distanceTo(current.position()) <= params.withinRadius
                );
            },
            start: () => {
                if (target !== undefined) support.navigator.moveTo(target.position(), params.speedMultiplier, 1);
            },
            tick: () => {
                support.navigator.tick();
            },
            stop: () => {
                support.navigator.stop();
                target = undefined;
            }
        };
    }
});

/** What `minecraft:behavior.swell` declares. */
export interface SwellParams {
    /** How close the target has to be to start swelling, in blocks. */
    readonly startDistance: number;
    /** How far the target has to get to stop it, in blocks. */
    readonly stopDistance: number;
}

/**
 * `minecraft:behavior.swell`, which the creeper carries.
 *
 * Java's `SwellGoal` starts inside 3 blocks and reverses outside 7 or when it
 * loses line of sight, which is exactly what the creeper's `start_distance`
 * of 2.5 and `stop_distance` of 6 do. The explosion itself belongs to
 * `minecraft:explode`, so the goal only holds the entity still and tells the
 * world to prime it.
 */
export const swell = goal<SwellParams>({
    name: 'minecraft:behavior.swell',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        startDistance: numberAt(body, 'start_distance', 3),
        stopDistance: numberAt(body, 'stop_distance', 7)
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        return {
            canStart: () => {
                target = support.target();
                return target !== undefined && support.distanceTo(target.position()) <= params.startDistance;
            },
            canContinue: () => {
                const current = support.target();
                if (current === undefined) return false;
                if (!support.canSee(current)) return false;
                return support.distanceTo(current.position()) <= params.stopDistance;
            },
            start: () => {
                support.navigator.stop();
            },
            tick: () => {
                if (target !== undefined) support.lookAtMob(target);
            },
            stop: () => {
                target = undefined;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.hold_ground` declares. */
export interface HoldGroundParams {
    /** Whether nearby friends are told to hold too. */
    readonly broadcast: boolean;
    /** How far the broadcast reaches, in blocks. */
    readonly broadcastRange: number;
    /** How close the target has to be before the entity gives up holding, in blocks. */
    readonly minRadius: number;
    /** The event fired on friends inside the radius. */
    readonly withinRadiusEvent: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.hold_ground`, which the piglin brute carries. It stands
 * and faces its target instead of charging, and can call friends in.
 */
export const holdGround = goal<HoldGroundParams>({
    name: 'minecraft:behavior.hold_ground',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        broadcast: booleanAt(body, 'broadcast', false),
        broadcastRange: numberAt(body, 'broadcast_range', 8),
        minRadius: numberAt(body, 'min_radius', 10),
        withinRadiusEvent: eventAt(body, 'within_radius_event')
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        return {
            canStart: () => {
                target = support.target();
                return target !== undefined && support.distanceTo(target.position()) > params.minRadius;
            },
            canContinue: () => {
                const current = support.target();
                return current !== undefined && support.distanceTo(current.position()) > params.minRadius;
            },
            start: () => {
                support.navigator.stop();
                if (!params.broadcast) return;
                for (const friend of support.mobs(params.broadcastRange))
                    support.fire(params.withinRadiusEvent, friend);
            },
            tick: () => {
                if (target !== undefined) support.lookAtMob(target);
            },
            stop: () => {
                target = undefined;
            }
        };
    }
});

/** What the roar-style goals declare. */
export interface RoarParams {
    /** How long the roar lasts, in ticks. */
    readonly duration: number;
}

/**
 * `minecraft:behavior.roar`, which the warden carries. It holds the entity
 * still for the roar animation.
 */
export const roar = goal<RoarParams>({
    name: 'minecraft:behavior.roar',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({ duration: ticksAt(body, 'duration', 4.2) })),
    create: (params, support) => {
        let remaining = 0;
        return {
            canStart: () => support.target() !== undefined,
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.duration;
                support.navigator.stop();
            },
            tick: () => {
                remaining -= 1;
                const current = support.target();
                if (current !== undefined) support.lookAtMob(current);
            },
            stop: () => {
                remaining = 0;
            }
        };
    }
});

/** What `minecraft:behavior.knockback_roar` declares. */
export interface KnockbackRoarParams {
    /** How long the whole roar lasts, in ticks. */
    readonly duration: number;
    /** How far into the roar the knockback lands, in ticks. */
    readonly attackTime: number;
    /** How long before the roar can run again, in ticks. */
    readonly cooldown: number;
    /** How far the knockback reaches, in blocks. */
    readonly range: number;
    /** How much damage the roar deals. */
    readonly damage: number;
    readonly horizontalStrength: number;
    readonly verticalStrength: number;
    /** Which mobs in range the roar throws back. */
    readonly knockbackFilters: Filter | undefined;
    /** Which mobs in range the roar hurts. */
    readonly damageFilters: Filter | undefined;
    readonly onRoarEnd: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.knockback_roar`, which the ravager carries. Part way into the roar it hurts
 * every mob in range the damage filters accept and throws back every one the knockback filters
 * accept, which is Java's `Ravager.roar`: 6 damage to every living thing but an illager within 4
 * blocks, then a strong knockback to all of them.
 */
export const knockbackRoar = goal<KnockbackRoarParams>({
    name: 'minecraft:behavior.knockback_roar',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 1),
        attackTime: ticksAt(body, 'attack_time', 0.5),
        cooldown: ticksAt(body, 'cooldown_time', 10),
        range: numberAt(body, 'knockback_range', 4),
        damage: numberAt(body, 'knockback_damage', 6),
        horizontalStrength: numberAt(body, 'knockback_horizontal_strength', 4),
        verticalStrength: numberAt(body, 'knockback_vertical_strength', 1),
        knockbackFilters: filterAt(body, 'knockback_filters'),
        damageFilters: filterAt(body, 'damage_filters'),
        onRoarEnd: eventAt(body, 'on_roar_end')
    })),
    create: (params, support) => {
        let remaining = 0;
        let cooldown = 0;
        let roared = false;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                return support.target() !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.duration;
                roared = false;
                support.navigator.stop();
            },
            tick: () => {
                remaining -= 1;
                if (roared || remaining > params.duration - params.attackTime) return;
                roared = true;
                for (const mob of support.mobs(params.range)) {
                    if (params.damage > 0 && support.matches(params.damageFilters, mob))
                        support.world.attack?.(mob, params.damage);
                    if (support.matches(params.knockbackFilters, mob))
                        support.world.knockback?.(mob, params.horizontalStrength, params.verticalStrength);
                }
            },
            stop: () => {
                remaining = 0;
                cooldown = params.cooldown;
                support.fire(params.onRoarEnd);
            }
        };
    }
});

/** What `minecraft:behavior.sonic_boom` declares. */
export interface SonicBoomParams {
    /** How long the charge and beam take together, in ticks. */
    readonly duration: number;
    /** How long before the beam can fire again, in ticks. */
    readonly cooldown: number;
    readonly damage: number;
    readonly horizontalStrength: number;
    readonly verticalStrength: number;
    readonly heightCap: number;
    readonly chargeSound: string | undefined;
    readonly attackSound: string | undefined;
}

/**
 * `minecraft:behavior.sonic_boom`, which the warden carries. It charges, then
 * hits the target through walls and throws it back.
 */
export const sonicBoom = goal<SonicBoomParams>({
    name: 'minecraft:behavior.sonic_boom',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        duration: ticksAt(body, 'duration', 3.4),
        cooldown: ticksAt(body, 'attack_cooldown', 2),
        damage: numberAt(body, 'attack_damage', 30),
        horizontalStrength: numberAt(body, 'knockback_horizontal_strength', 2.5),
        verticalStrength: numberAt(body, 'knockback_vertical_strength', 0.5),
        heightCap: numberAt(body, 'knockback_height_cap', 1.4),
        chargeSound: stringAt(body, 'charge_sound'),
        attackSound: stringAt(body, 'attack_sound')
    })),
    create: (params, support) => {
        let remaining = 0;
        let cooldown = 0;
        let fired = false;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                return support.target() !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = params.duration;
                fired = false;
                support.navigator.stop();
                support.playSound(params.chargeSound);
            },
            tick: () => {
                remaining -= 1;
                const current = support.target();
                if (current !== undefined) support.lookAtMob(current);
                if (fired || remaining > 0 || current === undefined) return;
                fired = true;
                support.playSound(params.attackSound);
                support.world.attack?.(current);
                support.world.knockback?.(
                    current,
                    params.horizontalStrength,
                    Math.min(params.verticalStrength, params.heightCap)
                );
            },
            stop: () => {
                remaining = 0;
                cooldown = params.cooldown;
            }
        };
    }
});

/** What `minecraft:behavior.ram_attack` declares. */
export interface RamAttackParams {
    /** How long between rams, in ticks. */
    readonly cooldown: Range;
    /** How far the ram starts from, in blocks. */
    readonly ramDistance: number;
    /** How close the target has to be before the entity backs up, in blocks. */
    readonly minRamDistance: number;
    readonly ramSpeed: number;
    readonly runSpeed: number;
    readonly knockbackForce: number;
    readonly knockbackHeight: number;
    readonly preRamSound: string | undefined;
    readonly impactSound: string | undefined;
    readonly onStart: readonly GoalEvent[];
}

/**
 * `minecraft:behavior.ram_attack`, which the goat carries. It backs off to
 * `ram_distance`, charges in a straight line and knocks the target away.
 */
export const ramAttack = goal<RamAttackParams>({
    name: 'minecraft:behavior.ram_attack',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        cooldown: tickRangeAt(body, 'cooldown_range', [30, 60]),
        ramDistance: numberAt(body, 'ram_distance', 5),
        minRamDistance: numberAt(body, 'min_ram_distance', 4),
        ramSpeed: numberAt(body, 'ram_speed', 2),
        runSpeed: numberAt(body, 'run_speed', 1),
        knockbackForce: numberAt(body, 'knockback_force', 5),
        knockbackHeight: numberAt(body, 'knockback_height', 0.1),
        preRamSound: stringAt(body, 'pre_ram_sound'),
        impactSound: stringAt(body, 'ram_impact_sound'),
        onStart: eventsAt(body, 'on_start')
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        let cooldown = 0;
        let charging = false;

        return {
            canStart: () => {
                if (cooldown > 0) {
                    cooldown -= 1;
                    return false;
                }
                target = support.target();
                return target !== undefined && support.distanceTo(target.position()) >= params.minRamDistance;
            },
            canContinue: () => charging && support.target() !== undefined,
            start: () => {
                charging = true;
                support.playSound(params.preRamSound);
                support.fireAll(params.onStart);
                if (target !== undefined) support.navigator.moveTo(target.position(), params.ramSpeed, 1);
            },
            tick: () => {
                const current = target;
                if (current === undefined) return;
                support.lookAtMob(current);
                support.navigator.tick();
                if (support.distanceTo(current.position()) > 1.5) return;
                support.playSound(params.impactSound);
                support.world.attack?.(current);
                support.world.knockback?.(current, params.knockbackForce, params.knockbackHeight);
                charging = false;
            },
            stop: () => {
                charging = false;
                cooldown = support.between(params.cooldown[0], params.cooldown[1]);
                support.navigator.stop();
                target = undefined;
            }
        };
    }
});

/** What `minecraft:behavior.stomp_attack` declares. */
export interface StompAttackParams extends MeleeAttackParams {
    /** How far the stomp reaches, as a multiple of the entity's width. */
    readonly stompRangeMultiplier: number;
    /** How far from the stomp the damage stops, as a multiple of the width. */
    readonly noDamageRangeMultiplier: number;
}

/**
 * `minecraft:behavior.stomp_attack`, which the ravager carries. It is the
 * melee loop with an area hit rather than a single swing.
 */
export const stompAttack = goal<StompAttackParams>({
    name: 'minecraft:behavior.stomp_attack',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        ...meleeFrom(body),
        stompRangeMultiplier: numberAt(body, 'stomp_range_multiplier', 2),
        noDamageRangeMultiplier: numberAt(body, 'no_damage_range_multiplier', 2)
    })),
    create: (params, support) =>
        meleeLoop(support, {
            ...meleeOptions(params),
            reach: MELEE_REACH * (params.stompRangeMultiplier / 2)
        })
});

/**
 * `minecraft:behavior.slime_attack`, which the slime line carries. A slime
 * hurts whatever it lands on, so the goal aims the heading at the target and
 * lets `slime_keep_on_jumping` do the moving.
 *
 * It takes `look` at a better priority than `slime_random_direction`, which is
 * how a slime that has a target stops wandering and starts closing in.
 */
export const slimeAttack = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.slime_attack',
    controlFlags: ['look'],
    schema: bodySchema((body) => body),
    create: (_params, support) => ({
        canStart: () => support.target() !== undefined,
        tick: () => {
            const current = support.target();
            if (current === undefined) return;
            support.lookAtMob(current);
            slimeHeadingOf(support.entity).toward(support.position(), current.position());
            if (support.distanceTo(current.position()) <= MELEE_REACH) support.world.attack?.(current);
        }
    })
});

/** How long a guardian's beam takes to lock on before it starts charging, from Java's `attackTime = -10`. */
const GUARDIAN_LOCK_TICKS = 10;

/** How long the beam charges once locked: `Guardian.getAttackDuration`, 60 for the elder. */
const GUARDIAN_CHARGE_TICKS = 80;
const ELDER_GUARDIAN_CHARGE_TICKS = 60;

/**
 * `minecraft:behavior.guardian_attack`, which the guardian and the elder guardian carry. Java's
 * `GuardianAttackGoal`: the guardian holds still and locks its beam for 10 ticks, charges it for
 * 80 (the elder for 60), then hurts the target and lets it go, so the targeting goals have to
 * pick it again for another beam. A guardian that loses sight of its target drops it, and one
 * whose target comes within 3 blocks stops beaming; the elder keeps beaming at any range.
 *
 * Java's beam deals 1 magic damage (3 for the elder) and then the melee damage in the same tick,
 * and the second blow inside the grace period only deals what it adds to the first, so the
 * target loses the melee damage in all.
 */
export const guardianAttack = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.guardian_attack',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        const elder = (): boolean => support.entity.families().includes('guardian_elder');
        let attackTime = 0;
        return {
            canStart: () => support.target() !== undefined,
            canContinue: () => {
                const current = support.target();
                if (current === undefined) return false;
                return elder() || support.distanceTo(current.position()) > 3;
            },
            start: () => {
                attackTime = -GUARDIAN_LOCK_TICKS;
                support.navigator.stop();
            },
            tick: () => {
                const current = support.target();
                if (current === undefined) return;
                support.navigator.stop();
                support.lookAtMob(current);
                if (!support.canSee(current)) {
                    support.setTarget(undefined);
                    return;
                }
                attackTime += 1;
                if (attackTime < (elder() ? ELDER_GUARDIAN_CHARGE_TICKS : GUARDIAN_CHARGE_TICKS)) return;
                support.world.attack?.(current);
                support.setTarget(undefined);
            },
            stop: () => {
                attackTime = 0;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.ocelotattack` declares. */
export interface OcelotAttackParams {
    /** How long between pounces, in ticks. */
    readonly cooldown: number;
    /** How far the goal reaches at all, in blocks. */
    readonly maxDistance: number;
    /** Inside this distance the entity sneaks, in blocks. */
    readonly maxSneakRange: number;
    /** Inside this distance the entity sprints, in blocks. */
    readonly maxSprintRange: number;
    /** How far a swing reaches, as a multiple of the entity's width. */
    readonly reachMultiplier: number;
    readonly sneakSpeedMultiplier: number;
    readonly sprintSpeedMultiplier: number;
    readonly walkSpeedMultiplier: number;
}

/**
 * `minecraft:behavior.ocelotattack`, which the ocelot and the cat carry. It
 * sneaks up, sprints the last stretch and swings.
 */
export const ocelotAttack = goal<OcelotAttackParams>({
    name: 'minecraft:behavior.ocelotattack',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        cooldown: ticksAt(body, 'cooldown_time', 1),
        maxDistance: numberAt(body, 'max_distance', 15),
        maxSneakRange: numberAt(body, 'max_sneak_range', 15),
        maxSprintRange: numberAt(body, 'max_sprint_range', 4),
        reachMultiplier: numberAt(body, 'reach_multiplier', 2),
        sneakSpeedMultiplier: numberAt(body, 'sneak_speed_multiplier', 0.6),
        sprintSpeedMultiplier: numberAt(body, 'sprint_speed_multiplier', 1.33),
        walkSpeedMultiplier: numberAt(body, 'walk_speed_multiplier', 0.8)
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        let cooldown = 0;
        return {
            canStart: () => {
                target = support.target();
                return target !== undefined && support.distanceTo(target.position()) <= params.maxDistance;
            },
            canContinue: () => {
                const current = support.target();
                return current !== undefined && support.distanceTo(current.position()) <= params.maxDistance;
            },
            start: () => {
                cooldown = 0;
            },
            tick: () => {
                const current = target;
                if (current === undefined) return;
                const where = current.position();
                const range = support.distanceTo(where);
                support.lookAtMob(current);
                const speed =
                    range <= params.maxSprintRange
                        ? params.sprintSpeedMultiplier
                        : range <= params.maxSneakRange
                          ? params.sneakSpeedMultiplier
                          : params.walkSpeedMultiplier;
                support.navigator.moveTo(where, speed, 1);
                cooldown = Math.max(0, cooldown - 1);
                if (cooldown > 0 || range > MELEE_REACH * (params.reachMultiplier / 2)) return;
                cooldown = params.cooldown;
                support.world.attack?.(current);
            },
            stop: () => {
                support.navigator.stop();
                target = undefined;
            }
        };
    }
});

/** What `minecraft:behavior.stalk_and_pounce_on_target` declares. */
export interface StalkAndPounceParams {
    /** How long the entity watches before it pounces, in ticks. */
    readonly interestTime: number;
    /** How far the pounce carries, in blocks. */
    readonly leapDistance: number;
    readonly leapHeight: number;
    /** How far the entity stalks from, in blocks. */
    readonly maxStalkDistance: number;
    /** The furthest the pounce starts from, in blocks. */
    readonly pounceMaxDistance: number;
    /** How close the pounce has to land to hurt, in blocks. */
    readonly strikeDistance: number;
    readonly stalkSpeed: number;
    /** How long the entity stays stuck before giving up, in ticks. */
    readonly stuckTime: number;
    /** Which targets it stalks, with the target as `other`; absent stalks any. */
    readonly filters: Filter | undefined;
}

/**
 * `minecraft:behavior.stalk_and_pounce_on_target`, which the fox carries. It creeps into range,
 * waits out `interest_time` and leaps, and bites once the leap carries it within
 * `strike_dist`, as Java's `Fox.FoxPounceGoal.tick` does at 2 blocks.
 *
 * Like Java's `Fox$StalkPreyGoal` it only starts on a target farther than `pounce_max_dist`,
 * which it creeps up to; a target already that close is left to the melee goal. `filters`, a
 * server key, names the prey it stalks, as Java's `STALKABLE_PREY` does.
 */
export const stalkAndPounceOnTarget = goal<StalkAndPounceParams>({
    name: 'minecraft:behavior.stalk_and_pounce_on_target',
    controlFlags: ['move', 'look', 'jump'],
    schema: bodySchema((body) => ({
        interestTime: ticksAt(body, 'interest_time', 2),
        leapDistance: numberAt(body, 'leap_dist', 0.8),
        leapHeight: numberAt(body, 'leap_height', 0.9),
        maxStalkDistance: numberAt(body, 'max_stalk_dist', 10),
        pounceMaxDistance: numberAt(body, 'pounce_max_dist', 5),
        strikeDistance: numberAt(body, 'strike_dist', 2),
        stalkSpeed: numberAt(body, 'stalk_speed', 1.2),
        stuckTime: ticksAt(body, 'stuck_time', 2),
        filters: filterAt(body, 'filters')
    })),
    create: (params, support) => {
        /** How long a leap may stay in the air before the goal gives up on it, in ticks. */
        const leapTicks = 40;
        let target: GoalMob | undefined;
        let interest = 0;
        // Ticks the leap has been in the air, or undefined before the pounce.
        let leaping: number | undefined;
        let done = false;

        return {
            canStart: () => {
                target = support.target();
                if (target === undefined || !support.matches(params.filters, target)) return false;
                const range = support.distanceTo(target.position());
                return range > params.pounceMaxDistance && range <= params.maxStalkDistance;
            },
            canContinue: () => !done && support.target() !== undefined,
            start: () => {
                interest = 0;
                leaping = undefined;
                done = false;
            },
            tick: () => {
                const current = target;
                if (current === undefined) return;
                const where = current.position();
                support.lookAtMob(current);
                const range = support.distanceTo(where);
                if (leaping !== undefined) {
                    // Java's FoxPounceGoal.tick bites once the leap carries it within reach.
                    leaping += 1;
                    if (range <= params.strikeDistance) {
                        support.world.attack?.(current);
                        done = true;
                    } else if (leaping >= leapTicks || (leaping > 2 && support.flag('on_ground'))) done = true;
                    return;
                }
                if (range > params.pounceMaxDistance) {
                    // The walk advances along its path every tick, as Java's navigation ticks.
                    if (support.navigator.moveTo(where, params.stalkSpeed, 1)) support.navigator.tick();
                    interest = 0;
                    return;
                }
                support.navigator.stop();
                if ((interest += 1) < params.interestTime) return;
                leaping = 0;
                const here = support.position();
                const length = Math.hypot(where.x - here.x, where.z - here.z) || 1;
                support.world.push?.({
                    x: ((where.x - here.x) / length) * params.leapDistance,
                    y: params.leapHeight,
                    z: ((where.z - here.z) / length) * params.leapDistance
                });
            },
            stop: () => {
                support.navigator.stop();
                interest = 0;
                leaping = undefined;
                target = undefined;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.use_kinetic_weapon` declares. */
export interface UseKineticWeaponParams {
    /** How close the entity rides in before it strikes, in blocks. */
    readonly approachDistance: number;
    /** How far it backs off after a strike, in blocks. */
    readonly repositionDistance: Range;
    /** How long it waits between strikes, in ticks. */
    readonly cooldownDistance: Range;
    /** How far the weapon reaches, as a multiple of its own reach. */
    readonly weaponReachMultiplier: number;
    /** The least speed the weapon needs to hurt, as a multiple of the mount's speed. */
    readonly weaponMinSpeedMultiplier: number;
    /** Whether the goal steers the mount rather than the rider. */
    readonly hijackMountNavigation: boolean;
    readonly trackTarget: boolean;
    readonly speedMultiplier: number;
    readonly repositionSpeedMultiplier: number;
    readonly cooldownSpeedMultiplier: number;
}

/** The item component that makes a held item a spear, which Java's `SpearUseGoal` asks the main hand for. */
const KINETIC_WEAPON = 'minecraft:kinetic_weapon';

/**
 * `minecraft:behavior.use_kinetic_weapon`, which the five spear-carrying
 * entities carry. The weapon only hurts while its wielder is moving, so the
 * goal charges in, strikes and backs off to build speed again.
 *
 * It runs on foot or mounted, as Java's `SpearUseGoal` does, but only while
 * the main hand holds an item with `minecraft:kinetic_weapon`: Java's
 * `ableToAttack` asks for a target and a `KINETIC_WEAPON` component. The
 * zombie, husk, piglin, zombie pigman and zombie villager declare it above
 * `minecraft:behavior.melee_box_attack`, so one without a spear leaves its
 * `move` and `look` flags to the melee attack.
 */
export const useKineticWeapon = goal<UseKineticWeaponParams>({
    name: 'minecraft:behavior.use_kinetic_weapon',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        approachDistance: numberAt(body, 'approach_distance', 10),
        repositionDistance: rangeAt(body, 'reposition_distance', [8, 16]),
        cooldownDistance: rangeAt(body, 'cooldown_distance', [4, 8]),
        weaponReachMultiplier: numberAt(body, 'weapon_reach_multiplier', 0.5),
        weaponMinSpeedMultiplier: numberAt(body, 'weapon_min_speed_multiplier', 0.2),
        hijackMountNavigation: booleanAt(body, 'hijack_mount_navigation', false),
        trackTarget: booleanAt(body, 'track_target', false),
        speedMultiplier: numberAt(body, 'speed_multiplier', 1),
        repositionSpeedMultiplier: numberAt(body, 'reposition_speed_multiplier', 1),
        cooldownSpeedMultiplier: numberAt(body, 'cooldown_speed_multiplier', 1)
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        let backingOff = false;
        const holdsKineticWeapon = (): boolean => {
            const held = support.world.carriedItem?.();
            return held !== undefined && support.world.itemHasComponent?.(held, KINETIC_WEAPON) === true;
        };

        return {
            canStart: () => {
                if (!holdsKineticWeapon()) return false;
                target = support.target();
                return target !== undefined;
            },
            canContinue: () => holdsKineticWeapon() && support.target() !== undefined,
            start: () => {
                backingOff = false;
            },
            tick: () => {
                const current = target;
                if (current === undefined) return;
                const where = current.position();
                const range = support.distanceTo(where);
                support.lookAtMob(current);

                if (backingOff) {
                    if (range >= params.repositionDistance[0]) backingOff = false;
                    else {
                        const here = support.position();
                        support.navigator.moveTo(
                            {
                                x: here.x + (here.x - where.x),
                                y: here.y,
                                z: here.z + (here.z - where.z)
                            },
                            params.repositionSpeedMultiplier,
                            1
                        );
                        support.navigator.tick();
                    }
                    return;
                }

                support.navigator.moveTo(where, params.speedMultiplier, 1);
                support.navigator.tick();
                if (range > MELEE_REACH * params.weaponReachMultiplier) return;
                support.world.attack?.(current);
                backingOff = true;
            },
            stop: () => {
                support.navigator.stop();
                target = undefined;
            }
        };
    }
});

/** What `minecraft:behavior.eat_mob` declares. */
export interface EatMobParams {
    /** How long the swallow animation takes, in ticks. */
    readonly eatAnimationTime: number;
    /** How close the prey has to come, in blocks. */
    readonly reachMobDistance: number;
    /** How hard the prey is pulled in. */
    readonly pullInForce: number;
    readonly runSpeed: number;
    readonly eatSound: string | undefined;
    /** The loot the swallowed mob leaves behind. */
    readonly lootTable: string | undefined;
}

/**
 * `minecraft:behavior.eat_mob`, which the frog carries. It pulls the prey in
 * with its tongue and swallows it whole, which is why it has a loot table
 * rather than an attack.
 */
export const eatMob = goal<EatMobParams>({
    name: 'minecraft:behavior.eat_mob',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        eatAnimationTime: ticksAt(body, 'eat_animation_time', 0.3),
        reachMobDistance: numberAt(body, 'reach_mob_distance', 2),
        pullInForce: numberAt(body, 'pull_in_force', 0.4),
        runSpeed: numberAt(body, 'run_speed', 1),
        eatSound: stringAt(body, 'eat_mob_sound'),
        lootTable: stringAt(body, 'loot_table')
    })),
    create: (params, support) => {
        let prey: GoalMob | undefined;
        let swallowing = 0;

        return {
            canStart: () => {
                prey = support.target();
                return prey !== undefined;
            },
            canContinue: () => swallowing >= 0 && prey !== undefined,
            start: () => {
                swallowing = -1;
                if (prey !== undefined) support.navigator.moveTo(prey.position(), params.runSpeed, 1);
            },
            tick: () => {
                const current = prey;
                if (current === undefined) return;
                const where = current.position();
                support.lookAtMob(current);

                if (swallowing > 0) {
                    swallowing -= 1;
                    if (swallowing > 0) return;
                    support.playSound(params.eatSound);
                    if (params.lootTable !== undefined) support.world.dropLoot?.(params.lootTable, where);
                    support.world.attack?.(current);
                    swallowing = -1;
                    prey = undefined;
                    return;
                }

                support.navigator.tick();
                if (support.distanceTo(where) > params.reachMobDistance) return;
                support.world.knockback?.(current, -params.pullInForce, 0);
                swallowing = params.eatAnimationTime;
            },
            stop: () => {
                support.navigator.stop();
                swallowing = -1;
                prey = undefined;
            }
        };
    }
});

/** One entry of `minecraft:behavior.drink_potion`'s `potions` list. */
export interface PotionChoice {
    /** The potion id the entity drinks. */
    readonly id: number;
    /** The chance of picking it, in [0, 1]. */
    readonly chance: number;
    /** When the potion may be picked; absent means always. */
    readonly filters: Filter | undefined;
}

/** What `minecraft:behavior.drink_potion` declares. */
export interface DrinkPotionParams {
    readonly potions: readonly PotionChoice[];
    readonly speedModifier: number;
}

/** One status effect a potion gives, in the shape an entity applies it. */
export interface PotionEffect {
    readonly id: string;
    readonly durationTicks: number;
    readonly amplifier: number;
}

/**
 * The effects of the Bedrock potion ids the vanilla `drink_potion` goals name, which are Java's
 * `Potions` of the same name: three minutes of water breathing, fire resistance, swiftness and
 * invisibility, eight of long invisibility, and one instant healing.
 */
export const DRINKABLE_POTIONS: ReadonlyMap<number, readonly PotionEffect[]> = new Map([
    [7, [{ id: 'invisibility', durationTicks: 3600, amplifier: 0 }]],
    [8, [{ id: 'invisibility', durationTicks: 9600, amplifier: 0 }]],
    [12, [{ id: 'fire_resistance', durationTicks: 3600, amplifier: 0 }]],
    [14, [{ id: 'speed', durationTicks: 3600, amplifier: 0 }]],
    [19, [{ id: 'water_breathing', durationTicks: 3600, amplifier: 0 }]],
    [21, [{ id: 'instant_health', durationTicks: 1, amplifier: 0 }]]
]);

/** How long drinking a potion or a bucket of milk takes, Java's `PotionItem` and milk use time, in ticks. */
const DRINK_TICKS = 32;

/**
 * `minecraft:behavior.drink_potion`, which the witch and the wandering trader carry. The entity
 * picks the first potion whose filters pass and whose chance comes up, drinks it for Java's 32
 * ticks and then takes its effects, as Java's `Witch.aiStep` and the trader's `UseItemGoal` do.
 */
export const drinkPotion = goal<DrinkPotionParams>({
    name: 'minecraft:behavior.drink_potion',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        potions: recordsAt(body, 'potions').map((potion) => ({
            id: numberAt(potion, 'id', 0),
            chance: numberAt(potion, 'chance', 1),
            filters: filterAt(potion, 'filters')
        })),
        speedModifier: numberAt(body, 'speed_modifier', 1)
    })),
    create: (params, support) => {
        let remaining = 0;
        let drinking: PotionChoice | undefined;
        return {
            canStart: () => {
                drinking = params.potions.find(
                    (potion) => support.matches(potion.filters) && support.chance(potion.chance)
                );
                return drinking !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = DRINK_TICKS;
                support.navigator.stop();
            },
            tick: () => {
                remaining -= 1;
                if (remaining > 0 || drinking === undefined) return;
                const self = support.entity.filterContext().self;
                for (const effect of DRINKABLE_POTIONS.get(drinking.id) ?? [])
                    support.entity.applyStatusEffect(self, effect);
                drinking = undefined;
            },
            stop: () => {
                remaining = 0;
                drinking = undefined;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.charge_held_item` declares. */
export interface ChargeHeldItemParams {
    /** The items the entity charges, such as `minecraft:arrow`. */
    readonly items: readonly string[];
}

/**
 * `minecraft:behavior.charge_held_item`, which the skeleton line and the
 * piglin carry. It draws the bow or crossbow the entity holds before the
 * ranged attack fires it.
 */
export const chargeHeldItem = goal<ChargeHeldItemParams>({
    name: 'minecraft:behavior.charge_held_item',
    controlFlags: [],
    schema: bodySchema((body) => ({ items: stringsAt(body, 'items') })),
    create: (params, support) => {
        /** How long a crossbow takes to draw, which is the vanilla charge time. */
        const chargeTicks = 25;
        let remaining = 0;
        return {
            canStart: () => {
                if (support.target() === undefined) return false;
                const held = support.world.carriedItem?.();
                return held !== undefined && params.items.includes(held);
            },
            canContinue: () => remaining > 0,
            start: () => {
                remaining = chargeTicks;
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
 * A clock for the spell goals' intervals: the world's game time when it answers, and otherwise a
 * count of the times the goal looked, which is enough for a world that keeps no time.
 */
const spellClock = (support: GoalSupport): (() => number) => {
    let looked = 0;
    return () => {
        looked += 1;
        return support.world.gameTime?.() ?? looked;
    };
};

/** One spell's place in Java's spell goals: what it costs in time, and when it may run again. */
interface SpellTiming {
    /** How long the caster stands casting, Java's `getCastingTime`, in ticks. */
    readonly castDuration: number;
    /** How long from one cast's start until the spell may be cast again, Java's `getCastingInterval`. */
    readonly cooldownTime: number;
}

/**
 * Draws one spell from the candidates by their weights, as the Bedrock spell tables weigh them.
 * Java's spell goals never draw: the one candidate a table leaves is the one cast.
 */
const drawWeighted = <T extends { readonly weight: number }>(
    support: GoalSupport,
    candidates: readonly T[]
): T | undefined => {
    if (candidates.length <= 1) return candidates[0];
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = support.random() * total;
    for (const candidate of candidates) {
        roll -= candidate.weight;
        if (roll < 0) return candidate;
    }
    return candidates.at(-1);
};

/** What `minecraft:behavior.summon_entity` declares. */
export interface SummonEntityParams {
    /** The spells, each with its own cast, interval and summons. */
    readonly choices: readonly SummonChoice[];
}

/** One entry of `summon_choices`, which is one spell. */
export interface SummonChoice extends SpellTiming {
    /** The spell's place in the table, which keys its interval. */
    readonly index: number;
    /** How likely the spell is against the others the caster could cast at the same time. */
    readonly weight: number;
    /** How far the target may be, in blocks: at least the minimum and less than the maximum. */
    readonly minActivationRange: number;
    readonly maxActivationRange: number;
    readonly startSound: string | undefined;
    /** What the spell summons, step by step. */
    readonly sequence: readonly SummonStep[];
}

/** One step of a `summon_choices` sequence. */
export interface SummonStep {
    /** The entity type to create. */
    readonly entityType: string | undefined;
    /** How many to create. */
    readonly count: number;
    /** Whether they stand in a ring around the caster or in a line toward its target. */
    readonly shape: 'circle' | 'line';
    /** The ring's radius, or the line's length, in blocks. */
    readonly size: number;
    /** Ticks before the step, counted from the step before it or, for the first, from the cast's start. */
    readonly baseDelay: number;
    /** Ticks between one summon of the step and the next. */
    readonly delayPerSummon: number;
    /** The most of the type that may be near before the spell refuses to summon more. */
    readonly summonCap: number | undefined;
    /** How far around the caster the cap counts, in blocks. */
    readonly summonCapRadius: number;
    /** The event each summon runs once it exists, such as the vex's damage timer. */
    readonly summonEvent: string | undefined;
    readonly sound: string | undefined;
}

/** The angle a ring of evoker fangs or a line of them is laid out from, Java's `Mth.atan2`. */
const headingTo = (from: EntityPosition, to: EntityPosition): number => Math.atan2(to.z - from.z, to.x - from.x);

/**
 * Where an attack spell's summon stands: Java's `EvokerAttackSpellGoal.createSpellEntity`, which
 * walks down from a block above the higher of caster and target to a block below the lower, and
 * takes the first cell standing on a solid block. A column with no floor in that span gets none.
 */
const spellFloor = (support: GoalSupport, x: number, z: number, minY: number, maxY: number): number | undefined => {
    const view = support.navigation();
    if (view === undefined) return minY;
    for (let y = Math.floor(maxY); y >= Math.floor(minY) - 1; y -= 1) if (view.isSolid({ x, y: y - 1, z })) return y;
    return undefined;
};

/**
 * `minecraft:behavior.summon_entity`, which the evoker carries: Java's `SpellcasterIllager`
 * spell goals, with the spells the Bedrock table writes.
 *
 * Java's evoker has three spell goals. While one casts, the evoker stands still for the cast
 * (`EvokerCastingSpellGoal`) and no other spell may start; each spell may start again only
 * once its interval since its last start has run. The summon spell, priority 4, comes before the
 * attack spell, priority 5, and refuses when as many vexes as a draw below the cap are already
 * near (`EvokerSummonSpellGoal.canUse`). So the table's spells that summon under a cap go first,
 * and the rest by weight among those the target's distance admits.
 *
 * A spell runs at its first step's delay into the cast (Java's `getCastWarmupTime`), and only if
 * the caster still has its target. Every step's summons are created then, each one owned by the
 * caster, and one that waits longer is told so through its `warmup` field, the way Java's
 * `EvokerFangs` carry their `warmupDelay`. A ring starts at the heading to the target and turns
 * each ring after the first by the ring before it's spacing; a line runs from the caster toward
 * the target. Fangs stand on the floor between the caster's and the target's heights; a capped
 * summon appears a block above the caster, as Java's vexes do.
 */
export const summonEntity = goal<SummonEntityParams>({
    name: 'minecraft:behavior.summon_entity',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        choices: recordsAt(body, 'summon_choices').map((choice, index) => ({
            index,
            weight: numberAt(choice, 'weight', 1),
            castDuration: ticksAt(choice, 'cast_duration', 1),
            cooldownTime: ticksAt(choice, 'cooldown_time', 0),
            minActivationRange: numberAt(choice, 'min_activation_range', 0),
            maxActivationRange: numberAt(choice, 'max_activation_range', 32),
            startSound: stringAt(choice, 'start_sound_event'),
            sequence: recordsAt(choice, 'sequence').map((step) => {
                const cap = step['summon_cap'];
                return {
                    entityType: stringAt(step, 'entity_type'),
                    count: numberAt(step, 'num_entities_spawned', 1),
                    shape: stringAt(step, 'shape') === 'line' ? ('line' as const) : ('circle' as const),
                    size: numberAt(step, 'size', 1),
                    baseDelay: ticksAt(step, 'base_delay', 0),
                    delayPerSummon: ticksAt(step, 'delay_per_summon', 0),
                    summonCap: typeof cap === 'number' ? cap : undefined,
                    summonCapRadius: numberAt(step, 'summon_cap_radius', 0),
                    summonEvent: stringAt(step, 'summon_event'),
                    sound: stringAt(step, 'sound_event')
                };
            })
        }))
    })),
    create: (params, support) => {
        const now = spellClock(support);
        const readyAt = new Map<number, number>();
        let choice: SummonChoice | undefined;
        let elapsed = 0;

        /** Java's `EvokerSummonSpellGoal.canUse` draw: fewer of the type near than a roll below the cap. */
        const underCap = (spell: SummonChoice): boolean =>
            spell.sequence.every((step) => {
                if (step.summonCap === undefined || step.entityType === undefined) return true;
                const near = support
                    .mobs(step.summonCapRadius)
                    .filter((mob) => mob.identifier?.() === step.entityType).length;
                return support.randomInt(step.summonCap) + 1 > near;
            });
        const summons = (spell: SummonChoice): boolean => spell.sequence.some((step) => step.summonCap !== undefined);

        const cast = (spell: SummonChoice, target: GoalMob): void => {
            const here = support.position();
            const there = target.position();
            const heading = headingTo(here, there);
            const minY = Math.min(here.y, there.y);
            const maxY = Math.max(here.y, there.y) + 1;
            let offset = 0;
            let turn = 0;
            for (const [index, step] of spell.sequence.entries()) {
                if (index > 0) offset += step.baseDelay;
                support.playSound(step.sound);
                if (step.entityType === undefined) continue;
                for (let member = 0; member < step.count; member += 1) {
                    let x: number;
                    let z: number;
                    let yaw: number;
                    if (step.shape === 'line') {
                        const along = (step.size / step.count) * (member + 1);
                        x = here.x + Math.cos(heading) * along;
                        z = here.z + Math.sin(heading) * along;
                        yaw = heading;
                    } else {
                        yaw = heading + (member * Math.PI * 2) / step.count + turn;
                        x = here.x + Math.cos(yaw) * step.size;
                        z = here.z + Math.sin(yaw) * step.size;
                    }
                    const y = step.summonCap === undefined ? spellFloor(support, x, z, minY, maxY) : here.y + 1;
                    if (y === undefined) continue;
                    const summoned = support.world.spawn?.(step.entityType, { x, y, z }, undefined, {
                        owned: true,
                        yaw: (yaw * 180) / Math.PI,
                        data: { warmup: offset + member * step.delayPerSummon }
                    });
                    if (summoned !== undefined && step.summonEvent !== undefined)
                        support.world.fireOn?.(summoned, step.summonEvent);
                }
                if (step.shape === 'circle') turn = (Math.PI * 2) / step.count;
            }
        };

        return {
            canStart: () => {
                const target = support.target();
                if (target === undefined) return false;
                const time = now();
                const range = support.distanceTo(target.position());
                const ready = params.choices.filter(
                    (spell) =>
                        time >= (readyAt.get(spell.index) ?? 0) &&
                        range >= spell.minActivationRange &&
                        range < spell.maxActivationRange
                );
                const summoning = ready.filter(summons);
                choice =
                    summoning.find(underCap) ??
                    drawWeighted(
                        support,
                        ready.filter((spell) => !summons(spell))
                    );
                if (choice === undefined) return false;
                readyAt.set(choice.index, time + choice.cooldownTime);
                return true;
            },
            canContinue: () => choice !== undefined && elapsed < choice.castDuration,
            start: () => {
                elapsed = 0;
                support.navigator.stop();
                support.playSound(choice?.startSound);
            },
            tick: () => {
                if (choice === undefined) return;
                const target = support.target();
                if (target !== undefined) support.lookAtMob(target);
                elapsed += 1;
                if (elapsed === (choice.sequence[0]?.baseDelay ?? 0) && target !== undefined) cast(choice, target);
            },
            stop: () => {
                elapsed = 0;
                choice = undefined;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** What `minecraft:behavior.send_event` declares. */
export interface SendEventParams {
    /** The spells the goal may cast, each with its own cast, interval and subject. */
    readonly choices: readonly SendEventChoice[];
}

/** One entry of `event_choices`, which is one spell cast on another mob. */
export interface SendEventChoice extends SpellTiming {
    readonly index: number;
    readonly weight: number;
    /** How far the subject may be, in blocks. */
    readonly minActivationRange: number;
    readonly maxActivationRange: number;
    /** Which mobs the spell may be cast on, with the mob as `other`. */
    readonly filters: Filter | undefined;
    readonly startSound: string | undefined;
    /** The events fired on the subject, each this many ticks after the one before it. */
    readonly sequence: readonly {
        readonly event: string | undefined;
        readonly delay: number;
        readonly sound: string | undefined;
    }[];
}

/**
 * `minecraft:behavior.send_event`, which the evoker carries for its wololo spell: Java's
 * `EvokerWololoSpellGoal`.
 *
 * The spell is cast only by a caster with no attack target and only while `mobGriefing` is on.
 * It picks one mob at random among those its filters accept within its activation range, stands
 * casting at it, and fires each event of its sequence on that mob at the event's delay, as long
 * as the mob is still alive. Like the summon spells, it may start again once its interval since
 * its last start has run.
 */
export const sendEvent = goal<SendEventParams>({
    name: 'minecraft:behavior.send_event',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        choices: recordsAt(body, 'event_choices').map((choice, index) => ({
            index,
            weight: numberAt(choice, 'weight', 1),
            castDuration: ticksAt(choice, 'cast_duration', 1),
            cooldownTime: ticksAt(choice, 'cooldown_time', 0),
            minActivationRange: numberAt(choice, 'min_activation_range', 0),
            maxActivationRange: numberAt(choice, 'max_activation_range', 16),
            filters: filterAt(choice, 'filters'),
            startSound: stringAt(choice, 'start_sound_event'),
            sequence: recordsAt(choice, 'sequence').map((step) => ({
                event: stringAt(step, 'event'),
                delay: ticksAt(step, 'base_delay', 0),
                sound: stringAt(step, 'sound_event')
            }))
        }))
    })),
    create: (params, support) => {
        const now = spellClock(support);
        const readyAt = new Map<number, number>();
        let choice: SendEventChoice | undefined;
        let subject: GoalMob | undefined;
        let elapsed = 0;

        return {
            canStart: () => {
                if (support.target() !== undefined || support.world.gameRule?.('mobGriefing') === false) return false;
                const time = now();
                const ready = params.choices.filter((spell) => time >= (readyAt.get(spell.index) ?? 0));
                const spell = drawWeighted(support, ready);
                if (spell === undefined) return false;
                const subjects = support.mobs(spell.maxActivationRange).filter((mob) => {
                    const away = support.distanceTo(mob.position());
                    return away >= spell.minActivationRange && support.matches(spell.filters, mob);
                });
                if (subjects.length === 0) return false;
                choice = spell;
                subject = subjects[support.randomInt(subjects.length)];
                readyAt.set(spell.index, time + spell.cooldownTime);
                return true;
            },
            canContinue: () => choice !== undefined && subject !== undefined && elapsed < choice.castDuration,
            start: () => {
                elapsed = 0;
                support.navigator.stop();
                support.playSound(choice?.startSound);
            },
            tick: () => {
                if (choice === undefined || subject === undefined) return;
                support.lookAtMob(subject);
                elapsed += 1;
                let at = 0;
                for (const step of choice.sequence) {
                    at += step.delay;
                    if (at !== elapsed) continue;
                    support.playSound(step.sound);
                    if (step.event !== undefined && (subject.health?.() ?? 1) > 0)
                        support.world.fireOn?.(subject, step.event);
                }
            },
            stop: () => {
                elapsed = 0;
                choice = undefined;
                subject = undefined;
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** How close across Java's wither closes on its target, `horizontalDistanceSqr() > 9.0`, in blocks. */
const WITHER_APPROACH_DISTANCE = 3;

/** How far above its target Java's wither climbs while it has more than half its health, in blocks. */
const WITHER_HOVER_HEIGHT = 5;

/** How often the approach re-aims at a target that has moved, in ticks. */
const WITHER_REPATH_TICKS = 10;

/**
 * `minecraft:behavior.wither_random_attack_pos_goal`, which the wither carries. Java moves the
 * wither in `WitherBoss.aiStep` rather than with a goal: with a target it flies across until it is
 * within 3 blocks of it, and climbs while it is below the target, or below 5 blocks over it while
 * it is not powered, that is while it has more than half its health.
 */
export const witherRandomAttackPos = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.wither_random_attack_pos_goal',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        let repath = 0;
        const approach = (): void => {
            const target = support.target()?.position();
            if (target === undefined) return;
            const here = support.position();
            const health = support.entity.attributes.get('health');
            const powered = health !== undefined && health.current <= health.max / 2;
            const floor = powered ? target.y : target.y + WITHER_HOVER_HEIGHT;
            const across = support.horizontalDistanceTo(target) > WITHER_APPROACH_DISTANCE;
            const destination = {
                x: across ? target.x : here.x,
                y: Math.max(here.y, floor),
                z: across ? target.z : here.z
            };
            support.navigator.moveTo(destination, 1, across ? WITHER_APPROACH_DISTANCE : 0.5);
        };
        return {
            canStart: () => support.target() !== undefined,
            canContinue: () => support.target() !== undefined,
            start: () => {
                repath = 0;
                approach();
            },
            tick: () => {
                if ((repath += 1) >= WITHER_REPATH_TICKS) {
                    repath = 0;
                    approach();
                }
                support.navigator.tick();
            },
            stop: () => {
                support.navigator.stop();
            },
            requiresUpdateEveryTick: () => true
        };
    }
});

/** Every goal in the attacking family. */
export const attackingGoals: readonly RegisterableGoal[] = [
    meleeAttack,
    meleeBoxAttack,
    delayedAttack,
    rangedAttack,
    fireAtTarget,
    chargeAttack,
    aquaticChargeAttack,
    swoopAttack,
    leapAtTarget,
    jumpAroundTarget,
    moveAroundTarget,
    moveTowardsTarget,
    swell,
    holdGround,
    roar,
    knockbackRoar,
    sonicBoom,
    ramAttack,
    stompAttack,
    slimeAttack,
    guardianAttack,
    ocelotAttack,
    stalkAndPounceOnTarget,
    useKineticWeapon,
    eatMob,
    drinkPotion,
    chargeHeldItem,
    summonEntity,
    sendEvent,
    witherRandomAttackPos
];
