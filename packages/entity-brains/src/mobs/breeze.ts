/**
 * The breeze's brain. Transcribed from `BreezeAi` in the 26.3 server jar.
 *
 * The breeze is the purest memory state machine of the twenty: seven of the 115 memory modules
 * exist only for it (`BREEZE_JUMP_COOLDOWN`, `BREEZE_SHOOT`, `BREEZE_SHOOT_CHARGING`,
 * `BREEZE_SHOOT_RECOVERING`, `BREEZE_SHOOT_COOLDOWN`, `BREEZE_JUMP_INHALING`,
 * `BREEZE_JUMP_TARGET`, plus `BREEZE_LEAVING_WATER`), and every one of them holds `Unit`, so the
 * whole fight is driven by which timers are currently running.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import {
    lookAtTargetSink,
    moveToTargetSink,
    randomStroll,
    startAttacking,
    stopAttackingIfTargetInvalid,
    swim,
    timedState
} from '../behavior/common.js';
import type { BehaviorControl } from '../behavior/control.js';
import { conditions, DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes, UNIT } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import { BreezeAttackEntitySensor, HurtBySensor, NearestLivingEntitySensor, PlayerSensor } from '../sensing/sensors.js';
import type { BrainContext } from '../world.js';
import { blockContaining, blockPosTracker } from '../world.js';

/** The named constants of `BreezeAi` and the behaviors it composes. */
export const BREEZE = {
    speedWhenSliding: 0.6,
    jumpCircleInnerRadius: 4,
    jumpCircleMiddleRadius: 8,
    jumpCircleOuterRadius: 24,
    ticksToRememberSeenTarget: 100,
    /** `new BreezeAi.SlideToTargetSink(20, 40)`: a much shorter sink than the usual (150, 250). */
    slideTimeout: { minDuration: 20, maxDuration: 40 },
    /** `SlideToTargetSink.stop` holds `BREEZE_SHOOT` for 60 ticks once a slide lands. */
    shootAfterSlideTicks: 60,
    /** `Shoot`'s three phases, in ticks. */
    shootChargingTicks: 10,
    shootTicks: 5,
    shootRecoveringTicks: 5,
    shootCooldownTicks: 20,
    jumpInhalingTicks: 10
} as const;

/**
 * Java's `BreezeAi.SlideToTargetSink`: a `MoveToTargetSink` that poses the breeze as sliding and,
 * on stopping, arms `BREEZE_SHOOT` for 60 ticks when it still has a target.
 */
function slideToTargetSink(): BehaviorControl {
    return moveToTargetSink({
        ...BREEZE.slideTimeout,
        onStart: (context) => context.body.playSound('minecraft:entity.breeze.slide'),
        onStop: (context) => {
            if (context.body.brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET)) {
                context.body.brain.setMemoryWithExpiry(
                    MemoryModuleTypes.BREEZE_SHOOT,
                    UNIT,
                    BREEZE.shootAfterSlideTicks
                );
            }
        }
    });
}

/**
 * Java's `Shoot`: charge, fire a wind charge, recover, cool down.
 *
 * The projectile is the host's; the four memories around it are the brain's, and this walks them
 * in order so that a host watching `BREEZE_SHOOT_CHARGING` and `BREEZE_SHOOT` sees the same
 * sequence Java produces.
 */
function shoot(): BehaviorControl {
    return timedState('Shoot', BREEZE.shootChargingTicks + BREEZE.shootTicks, {
        entryCondition: conditions(
            [MemoryModuleTypes.ATTACK_TARGET, 'value_present'],
            [MemoryModuleTypes.BREEZE_SHOOT, 'value_present'],
            [MemoryModuleTypes.BREEZE_SHOOT_COOLDOWN, 'value_absent']
        ),
        onStart: (context) => {
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.BREEZE_SHOOT_CHARGING,
                UNIT,
                BREEZE.shootChargingTicks
            );
            context.body.playSound('minecraft:entity.breeze.charge');
        },
        onStop: (context) => {
            context.body.brain.eraseMemory(MemoryModuleTypes.BREEZE_SHOOT);
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.BREEZE_SHOOT_RECOVERING,
                UNIT,
                BREEZE.shootRecoveringTicks
            );
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.BREEZE_SHOOT_COOLDOWN,
                UNIT,
                BREEZE.shootCooldownTicks
            );
            context.world.emitGameEvent('minecraft:projectile_shoot', context.body.position, context.body);
        }
    });
}

/** Java's `LongJump` for the breeze: inhale, then leap to a point on one of the jump circles. */
function longJump(): BehaviorControl {
    return timedState('LongJump', BREEZE.jumpInhalingTicks, {
        entryCondition: conditions(
            [MemoryModuleTypes.ATTACK_TARGET, 'value_present'],
            [MemoryModuleTypes.BREEZE_JUMP_COOLDOWN, 'value_absent'],
            [MemoryModuleTypes.BREEZE_JUMP_TARGET, 'value_absent']
        ),
        onStart: (context) => {
            const target = jumpTarget(context);
            if (target !== undefined) {
                context.body.brain.setMemory(MemoryModuleTypes.BREEZE_JUMP_TARGET, target);
            }
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.BREEZE_JUMP_INHALING,
                UNIT,
                BREEZE.jumpInhalingTicks
            );
        },
        onStop: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.BREEZE_JUMP_TARGET);
            if (target !== undefined) {
                context.body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                    target: blockPosTracker(target),
                    speedModifier: BREEZE.speedWhenSliding,
                    closeEnoughDist: 0
                });
                context.body.jump();
            }
            context.body.brain.eraseMemory(MemoryModuleTypes.BREEZE_JUMP_TARGET);
        }
    });
}

/**
 * Java's `BreezeUtil.randomPointBehindTarget`, reduced to the three radii it draws between.
 *
 * The breeze never lands on top of its target: the inner radius is 4 blocks, so it keeps the
 * distance that makes a wind charge worth firing.
 */
function jumpTarget(context: BrainContext): ReturnType<typeof blockContaining> | undefined {
    const target = context.body.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET);
    if (target === undefined) {
        return undefined;
    }
    const to = context.world.randomPos(context.body, {
        xzRange: BREEZE.jumpCircleOuterRadius,
        yRange: BREEZE.jumpCircleMiddleRadius,
        medium: 'land',
        towards: target.position
    });
    return to === undefined ? undefined : blockContaining(to);
}

/** Java's `ShootWhenStuck`: fires even without a slide when the breeze cannot path to its target. */
function shootWhenStuck(): BehaviorControl {
    return timedState('ShootWhenStuck', BREEZE.shootChargingTicks, {
        entryCondition: conditions(
            [MemoryModuleTypes.ATTACK_TARGET, 'value_present'],
            [MemoryModuleTypes.BREEZE_SHOOT_COOLDOWN, 'value_absent'],
            [MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE, 'value_present']
        ),
        onStart: (context) =>
            context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.BREEZE_SHOOT, UNIT, BREEZE.shootAfterSlideTicks)
    });
}

/** Java's `Slide`: walk towards the attack target at sliding speed. */
function slide(): BehaviorControl {
    return timedState('Slide', BREEZE.slideTimeout.maxDuration, {
        entryCondition: conditions([MemoryModuleTypes.ATTACK_TARGET, 'value_present']),
        onStart: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET);
            if (target !== undefined) {
                context.body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                    target: blockPosTracker(blockContaining(target.position)),
                    speedModifier: BREEZE.speedWhenSliding,
                    closeEnoughDist: 0
                });
            }
        }
    });
}

function coreActivity(): ActivityData {
    return activityData(Activities.CORE, prioritized(0, [swim(0.8), lookAtTargetSink(45, 90)]));
}

function idleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [0, startAttacking((context) => context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE))],
        [1, startAttacking((context) => context.body.brain.getMemory(MemoryModuleTypes.HURT_BY)?.entity)],
        [2, slideToTargetSink()],
        [
            3,
            new RunOne([
                [new DoNothing(20, 100), 1],
                [randomStroll(BREEZE.speedWhenSliding), 2]
            ])
        ]
    ]);
}

/**
 * Java's `initFightActivity`.
 *
 * `StopAttackingIfTargetInvalid.create(Sensor.wasEntityAttackableLastNTicks(body, 100).negate())`
 * is the one use of Java's `rememberPositives` helper: the breeze keeps a target it briefly lost
 * sight of for 100 ticks, which is what stops it from giving up every time it jumps behind a wall.
 */
function fightActivity(): ActivityData {
    let lastSeen = 0;
    return activityData(
        Activities.FIGHT,
        [
            [
                0,
                stopAttackingIfTargetInvalid({
                    stopAttackingWhen: (context, target) => {
                        if (context.world.isAttackable(context.body, target)) {
                            lastSeen = context.world.gameTime();
                            return false;
                        }
                        return context.world.gameTime() - lastSeen > BREEZE.ticksToRememberSeenTarget;
                    }
                })
            ],
            [1, shoot()],
            [2, longJump()],
            [3, shootWhenStuck()],
            [4, slide()]
        ],
        {
            conditions: [
                [MemoryModuleTypes.ATTACK_TARGET, 'value_present'],
                [MemoryModuleTypes.WALK_TARGET, 'value_absent']
            ]
        }
    );
}

/** The breeze's three activities: the core package, `idle` and `fight`. */
export function breezeActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), fightActivity()];
}

/** The breeze's registry entry. `BreezeAttackEntitySensor` picks the target that `fight` shoots at. */
export const BREEZE_BRAIN: BrainMobDefinition = {
    id: 'minecraft:breeze',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'hurt_by', 'nearest_players', 'breeze_attack_entity_sensor'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new HurtBySensor(),
                new PlayerSensor(),
                new BreezeAttackEntitySensor()
            ],
            activities: breezeActivities()
        }),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.IDLE])
};
