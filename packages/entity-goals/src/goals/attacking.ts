import type { Goal } from '@jsprismarine/entities';

import type { RegisterableGoal } from '../goal';
import { goal } from '../goal';
import type { GoalBody, GoalEvent, Range } from '../params';
import {
    bodySchema,
    booleanAt,
    eventAt,
    eventsAt,
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
        }
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
    /** How far the target may be for the goal to run at all, in blocks. */
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
                return target !== undefined && support.distanceTo(target.position()) <= params.attackRange[1];
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
            }
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
            if (target !== undefined) support.navigator.moveTo(target.position(), params.chargeSpeed, 1);
        },
        tick: () => {
            const current = target;
            if (current === undefined) return;
            support.lookAtMob(current);
            support.navigator.tick();
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

const readCharge = (defaults: Partial<ChargeAttackParams> = {}) =>
    bodySchema((body): ChargeAttackParams => ({
        chargeSpeed: numberAt(body, 'charge_speed', defaults.chargeSpeed ?? 1.5),
        maxChargeDistance: numberAt(body, 'max_charge_distance', defaults.maxChargeDistance ?? 16),
        overshootDistance: numberAt(body, 'charge_overshoot_distance', defaults.overshootDistance ?? 1),
        attackReach: numberAt(body, 'attack_reach', defaults.attackReach ?? 2),
        knockbackForce: numberAt(body, 'knockback_force', defaults.knockbackForce ?? 0),
        cooldown: tickRangeAt(body, 'charge_cooldown_time', [1, 1])
    }));

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

/**
 * `minecraft:behavior.swoop_attack`, which the phantom carries. It is a charge
 * that dives from above, so it keeps the look flag while it falls.
 */
export const swoopAttack = goal<ChargeAttackParams>({
    name: 'minecraft:behavior.swoop_attack',
    controlFlags: ['move', 'look'],
    schema: readCharge({ chargeSpeed: 1 }),
    create: (params, support) => chargeLoop(support, params)
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
                return support.chance(0.2);
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
            }
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
    readonly onRoarEnd: GoalEvent | undefined;
}

/**
 * `minecraft:behavior.knockback_roar`, which the ravager carries. It throws
 * everything in range away part way into the roar.
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
                for (const mob of support.mobs(params.range))
                    support.world.knockback?.(mob, params.horizontalStrength, params.verticalStrength);
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

/**
 * `minecraft:behavior.guardian_attack`, which the guardian and the elder
 * guardian carry. The beam takes time to lock on, which is why the goal holds
 * the entity still rather than closing in.
 */
export const guardianAttack = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.guardian_attack',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        /** How long the beam charges before it hurts, from the vanilla attack animation. */
        const chargeTicks = 80;
        let charge = 0;
        return {
            canStart: () => support.target() !== undefined,
            canContinue: () => {
                const current = support.target();
                return current !== undefined && support.canSee(current);
            },
            start: () => {
                charge = 0;
                support.navigator.stop();
            },
            tick: () => {
                const current = support.target();
                if (current === undefined) return;
                support.lookAtMob(current);
                charge += 1;
                if (charge < chargeTicks) return;
                charge = 0;
                support.world.attack?.(current);
            },
            stop: () => {
                charge = 0;
            }
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
}

/**
 * `minecraft:behavior.stalk_and_pounce_on_target`, which the fox carries. It
 * creeps into range, waits out `interest_time` and leaps.
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
        stuckTime: ticksAt(body, 'stuck_time', 2)
    })),
    create: (params, support) => {
        let target: GoalMob | undefined;
        let interest = 0;
        let pounced = false;

        return {
            canStart: () => {
                target = support.target();
                return target !== undefined && support.distanceTo(target.position()) <= params.maxStalkDistance;
            },
            canContinue: () => !pounced && support.target() !== undefined,
            start: () => {
                interest = 0;
                pounced = false;
            },
            tick: () => {
                const current = target;
                if (current === undefined) return;
                const where = current.position();
                support.lookAtMob(current);
                const range = support.distanceTo(where);
                if (range > params.pounceMaxDistance) {
                    support.navigator.moveTo(where, params.stalkSpeed, 1);
                    interest = 0;
                    return;
                }
                support.navigator.stop();
                if ((interest += 1) < params.interestTime) return;
                pounced = true;
                const here = support.position();
                const length = Math.hypot(where.x - here.x, where.z - here.z) || 1;
                support.world.push?.({
                    x: ((where.x - here.x) / length) * params.leapDistance,
                    y: params.leapHeight,
                    z: ((where.z - here.z) / length) * params.leapDistance
                });
                if (range <= params.strikeDistance) support.world.attack?.(current);
            },
            stop: () => {
                support.navigator.stop();
                interest = 0;
                target = undefined;
            }
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

/**
 * `minecraft:behavior.use_kinetic_weapon`, which the five mounted-lance
 * entities carry. The weapon only hurts while its wielder is moving, so the
 * goal rides in, strikes and backs off to build speed again.
 *
 * Only while the wielder is riding something, which is what the lance is for
 * and what `hijack_mount_navigation` is about. The zombie, husk, piglin,
 * zombie pigman and zombie villager all carry it on foot as well as mounted,
 * through `minecraft:not_on_zombie_horse`, and it claims the `move` and
 * `look` flags at a priority above `minecraft:behavior.melee_box_attack`'s.
 * A version that started on nothing more than having a target therefore took
 * those flags off the attack and left every zombie that had chosen a player
 * standing still in front of them.
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

        return {
            canStart: () => {
                if (support.world.vehicle?.() === undefined) return false;

                target = support.target();
                return target !== undefined;
            },
            canContinue: () => support.world.vehicle?.() !== undefined && support.target() !== undefined,
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
}

/** What `minecraft:behavior.drink_potion` declares. */
export interface DrinkPotionParams {
    readonly potions: readonly PotionChoice[];
    readonly speedModifier: number;
}

/**
 * `minecraft:behavior.drink_potion`, which the witch and the pillager carry.
 * The entity picks the first potion whose chance comes up and drinks it.
 */
export const drinkPotion = goal<DrinkPotionParams>({
    name: 'minecraft:behavior.drink_potion',
    controlFlags: ['move'],
    schema: bodySchema((body) => ({
        potions: recordsAt(body, 'potions').map((potion) => ({
            id: numberAt(potion, 'id', 0),
            chance: numberAt(potion, 'chance', 1)
        })),
        speedModifier: numberAt(body, 'speed_modifier', 1)
    })),
    create: (params, support) => {
        /** How long drinking takes, which is the vanilla potion use time. */
        const drinkTicks = 35;
        let remaining = 0;
        return {
            canStart: () => params.potions.length > 0 && params.potions.some((potion) => support.chance(potion.chance)),
            canContinue: () => remaining > 0,
            start: () => {
                remaining = drinkTicks;
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

/** What `minecraft:behavior.summon_entity` declares. */
export interface SummonEntityParams {
    /** The summons, each with the spell it casts and how often it may run. */
    readonly choices: readonly SummonChoice[];
}

/** One entry of `summon_choices`. */
export interface SummonChoice {
    readonly id: number;
    /** How long the cast takes, in ticks. */
    readonly castDuration: number;
    /** How long before the choice may run again, in ticks. */
    readonly cooldownTime: number;
    /** How far the target may be, in blocks. */
    readonly minActivationRange: number;
    readonly maxActivationRange: number;
    readonly startSound: string | undefined;
    /** What the cast does, as the spell's own sequence of steps. */
    readonly sequence: readonly SummonStep[];
}

/** One step of a `summon_choices` sequence. */
export interface SummonStep {
    /** The entity type to create. */
    readonly entityType: string | undefined;
    /** How many to create. */
    readonly numberOfSummons: number;
    /** The event to run on each. */
    readonly spawnEvent: string | undefined;
    /** How far from the caster they appear, in blocks. */
    readonly summonCap: number;
    readonly baseDelay: number;
}

/**
 * `minecraft:behavior.summon_entity`, which the evoker carries. One choice is
 * one spell, and a spell is a sequence of summon steps.
 */
export const summonEntity = goal<SummonEntityParams>({
    name: 'minecraft:behavior.summon_entity',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        choices: recordsAt(body, 'summon_choices').map((choice) => ({
            id: numberAt(choice, 'id', 0),
            castDuration: ticksAt(choice, 'cast_duration', 1),
            cooldownTime: ticksAt(choice, 'cooldown_time', 5),
            minActivationRange: numberAt(choice, 'min_activation_range', 0),
            maxActivationRange: numberAt(choice, 'max_activation_range', 16),
            startSound: stringAt(choice, 'start_sound_event'),
            sequence: recordsAt(choice, 'sequence').map((step) => ({
                entityType: stringAt(step, 'entity_type'),
                numberOfSummons: numberAt(step, 'num_entities_spawned', 1),
                spawnEvent: stringAt(step, 'entity_lifetime') === undefined ? stringAt(step, 'spawn_event') : undefined,
                summonCap: numberAt(step, 'summon_cap_radius', 1),
                baseDelay: ticksAt(step, 'base_delay', 0)
            }))
        }))
    })),
    create: (params, support) => {
        let choice: SummonChoice | undefined;
        let remaining = 0;
        const cooldowns = new Map<number, number>();

        return {
            canStart: () => {
                const target = support.target();
                if (target === undefined) return false;
                const range = support.distanceTo(target.position());
                choice = params.choices.find((candidate) => {
                    if ((cooldowns.get(candidate.id) ?? 0) > 0) return false;
                    return range >= candidate.minActivationRange && range <= candidate.maxActivationRange;
                });
                return choice !== undefined;
            },
            canContinue: () => remaining > 0,
            start: () => {
                if (choice === undefined) return;
                remaining = choice.castDuration;
                support.navigator.stop();
                support.playSound(choice.startSound);
            },
            tick: () => {
                for (const [id, ticks] of cooldowns) cooldowns.set(id, Math.max(0, ticks - 1));
                remaining -= 1;
                if (remaining > 0 || choice === undefined) return;
                const here = support.position();
                for (const step of choice.sequence) {
                    if (step.entityType === undefined) continue;
                    for (let index = 0; index < step.numberOfSummons; index += 1) {
                        support.world.spawn?.(
                            step.entityType,
                            {
                                x: here.x + (support.random() * 2 - 1) * step.summonCap,
                                y: here.y,
                                z: here.z + (support.random() * 2 - 1) * step.summonCap
                            },
                            step.spawnEvent
                        );
                    }
                }
            },
            stop: () => {
                if (choice !== undefined) cooldowns.set(choice.id, choice.cooldownTime);
                remaining = 0;
                choice = undefined;
            }
        };
    }
});

/** What `minecraft:behavior.send_event` declares. */
export interface SendEventParams {
    /** The event sequences the goal may run, each with its own cast and cooldown. */
    readonly choices: readonly SendEventChoice[];
}

/** One entry of `event_choices`. */
export interface SendEventChoice {
    readonly id: number;
    /** How long the cast takes, in ticks. */
    readonly castDuration: number;
    /** How long before the choice may run again, in ticks. */
    readonly cooldownTime: number;
    readonly minActivationRange: number;
    readonly maxActivationRange: number;
    readonly startSound: string | undefined;
    /** The events fired over the cast, each with its own delay in ticks. */
    readonly sequence: readonly { readonly event: GoalEvent | undefined; readonly delay: number }[];
}

/**
 * `minecraft:behavior.send_event`, which the evoker carries. It is
 * `summon_entity` with events instead of entities, which is how the fangs
 * attack is written.
 */
export const sendEvent = goal<SendEventParams>({
    name: 'minecraft:behavior.send_event',
    controlFlags: ['move', 'look'],
    schema: bodySchema((body) => ({
        choices: recordsAt(body, 'event_choices').map((choice) => ({
            id: numberAt(choice, 'id', 0),
            castDuration: ticksAt(choice, 'cast_duration', 1),
            cooldownTime: ticksAt(choice, 'cooldown_time', 5),
            minActivationRange: numberAt(choice, 'min_activation_range', 0),
            maxActivationRange: numberAt(choice, 'max_activation_range', 16),
            startSound: stringAt(choice, 'start_sound_event'),
            sequence: recordsAt(choice, 'sequence').map((step) => ({
                event: eventAt(step, 'event'),
                delay: ticksAt(step, 'base_delay', 0)
            }))
        }))
    })),
    create: (params, support) => {
        let choice: SendEventChoice | undefined;
        let elapsed = 0;
        const cooldowns = new Map<number, number>();

        return {
            canStart: () => {
                const target = support.target();
                if (target === undefined) return false;
                const range = support.distanceTo(target.position());
                choice = params.choices.find(
                    (candidate) =>
                        (cooldowns.get(candidate.id) ?? 0) <= 0 &&
                        range >= candidate.minActivationRange &&
                        range <= candidate.maxActivationRange
                );
                return choice !== undefined;
            },
            canContinue: () => choice !== undefined && elapsed < choice.castDuration,
            start: () => {
                elapsed = 0;
                support.navigator.stop();
                support.playSound(choice?.startSound);
            },
            tick: () => {
                for (const [id, ticks] of cooldowns) cooldowns.set(id, Math.max(0, ticks - 1));
                if (choice === undefined) return;
                for (const step of choice.sequence) if (step.delay === elapsed) support.fire(step.event);
                elapsed += 1;
            },
            stop: () => {
                if (choice !== undefined) cooldowns.set(choice.id, choice.cooldownTime);
                elapsed = 0;
                choice = undefined;
            }
        };
    }
});

/**
 * `minecraft:behavior.wither_random_attack_pos_goal`, which the wither
 * carries. It keeps the wither drifting around its target instead of standing
 * over it, which is what makes the heads fire from different angles.
 */
export const witherRandomAttackPos = goal<Record<string, unknown>>({
    name: 'minecraft:behavior.wither_random_attack_pos_goal',
    controlFlags: ['move'],
    schema: bodySchema((body) => body),
    create: (_params, support) => {
        /** How far the wither drifts from its target, in blocks. */
        const orbitRadius = 10;
        return {
            canStart: () => support.target() !== undefined,
            canContinue: () => support.navigator.walking && support.target() !== undefined,
            start: () => {
                const where = support.target()?.position();
                if (where === undefined) return;
                const angle = support.random() * Math.PI * 2;
                support.navigator.moveTo(
                    {
                        x: where.x + Math.cos(angle) * orbitRadius,
                        y: where.y + 4,
                        z: where.z + Math.sin(angle) * orbitRadius
                    },
                    1,
                    2
                );
            },
            tick: () => {
                support.navigator.tick();
            },
            stop: () => {
                support.navigator.stop();
            }
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
