/** The goat's brain. Transcribed from `GoatAi` in the 26.3 server jar. */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { countDownCooldownTicks } from '../behavior/builder.js';
import {
    animalMakeLove,
    animalPanic,
    babyFollowAdult,
    followTemptation,
    lookAtTargetSink,
    moveToTargetSink,
    randomStroll,
    sample,
    setEntityLookTargetSometimes,
    setWalkTargetFromLookTarget,
    swim,
    timedState,
    uniformInt
} from '../behavior/common.js';
import type { BehaviorControl, BehaviorHooks } from '../behavior/control.js';
import { Behavior, conditions, DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import {
    AdultSensor,
    HurtBySensor,
    NearestItemSensor,
    NearestLivingEntitySensor,
    PlayerSensor,
    TemptingSensor
} from '../sensing/sensors.js';
import { blockContaining, blockPosTracker, distanceSquared, EntityCondition } from '../world.js';

/** The named constants of `GoatAi`. */
export const GOAT = {
    ramPrepareTime: 20,
    ramMaxDistance: 7,
    ramMinDistance: 4,
    adultFollowRange: uniformInt(5, 16),
    speedWhenIdling: 1,
    speedWhenFollowingAdult: 1.25,
    speedWhenTempted: 1.25,
    speedWhenPanicking: 2,
    speedWhenPreparingToRam: 1.25,
    speedWhenRamming: 3,
    timeBetweenLongJumps: uniformInt(600, 1200),
    maxLongJumpHeight: 5,
    maxLongJumpWidth: 5,
    maxJumpVelocityMultiplier: 3.5714288,
    timeBetweenRams: uniformInt(600, 6000),
    timeBetweenRamsScreamer: uniformInt(100, 300),
    adultRamKnockbackForce: 2.5,
    babyRamKnockbackForce: 1
} as const;

const isScreamer = (body: { conditions: ReadonlySet<string> }): boolean =>
    body.conditions.has(EntityCondition.SCREAMING);

/**
 * Java's `RAM_TARGET_CONDITIONS`: anything but another goat, and an armor stand only while
 * `mobGriefing` is on.
 */
export function isRamTarget(entity: { type: string }, mobGriefing: boolean): boolean {
    if (entity.type === 'minecraft:goat') {
        return false;
    }
    return mobGriefing || entity.type !== 'minecraft:armor_stand';
}

/**
 * Java's `PrepareRamNearestTarget`: pick a victim, walk to a spot `RAM_MIN_DISTANCE` behind it,
 * then write `RAM_TARGET` and hand over to `RamTarget`.
 */
function prepareRamNearestTarget(cooldownOnFailure: (screamer: boolean) => number): BehaviorControl {
    const hooks: BehaviorHooks = {
        canStillUse: (context) => context.body.brain.hasMemoryValue(MemoryModuleTypes.RAM_TARGET),
        start: (context) => {
            const victim = context.body.brain
                .getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
                ?.findClosest(
                    (entity) =>
                        isRamTarget(entity, true) &&
                        distanceSquared(entity.position, context.body.position) <= GOAT.ramMaxDistance ** 2
                );
            if (victim === undefined) {
                context.body.brain.setMemory(
                    MemoryModuleTypes.RAM_COOLDOWN_TICKS,
                    cooldownOnFailure(isScreamer(context.body))
                );
                return;
            }
            context.body.playSound(
                isScreamer(context.body)
                    ? 'minecraft:entity.goat.screaming_prepare_ram'
                    : 'minecraft:entity.goat.prepare_ram'
            );
            context.body.brain.setMemory(MemoryModuleTypes.RAM_TARGET, victim.position);
            context.body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                target: blockPosTracker(blockContaining(victim.position)),
                speedModifier: GOAT.speedWhenPreparingToRam,
                closeEnoughDist: GOAT.ramMinDistance
            });
        }
    };
    return new Behavior(
        'PrepareRamNearestTarget',
        conditions(
            [MemoryModuleTypes.RAM_COOLDOWN_TICKS, 'value_absent'],
            [MemoryModuleTypes.RAM_TARGET, 'value_absent'],
            [MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES, 'value_present']
        ),
        hooks,
        { minDuration: GOAT.ramPrepareTime, maxDuration: GOAT.ramPrepareTime }
    );
}

/** Java's `RamTarget`: charge at `RAM_TARGET`, then redraw the ram cooldown. */
function ramTarget(interval: (screamer: boolean) => typeof GOAT.timeBetweenRams): BehaviorControl {
    const hooks: BehaviorHooks = {
        canStillUse: (context) => context.body.brain.hasMemoryValue(MemoryModuleTypes.RAM_TARGET),
        start: (context) => {
            const to = context.body.brain.getMemory(MemoryModuleTypes.RAM_TARGET);
            if (to !== undefined) {
                context.body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                    target: blockPosTracker(blockContaining(to)),
                    speedModifier: GOAT.speedWhenRamming,
                    closeEnoughDist: 0
                });
            }
        },
        stop: (context) => {
            context.body.playSound(
                isScreamer(context.body)
                    ? 'minecraft:entity.goat.screaming_ram_impact'
                    : 'minecraft:entity.goat.ram_impact'
            );
            context.body.brain.eraseMemory(MemoryModuleTypes.RAM_TARGET);
            context.body.brain.setMemory(
                MemoryModuleTypes.RAM_COOLDOWN_TICKS,
                sample(interval(isScreamer(context.body)), (bound) => context.world.randomInt(bound))
            );
        }
    };
    return new Behavior('RamTarget', conditions([MemoryModuleTypes.RAM_TARGET, 'value_present']), hooks, {
        minDuration: 200,
        maxDuration: 200
    });
}

/** Java's `LongJumpToRandomPos`, with the goat's 5 by 5 reach and its two jump sounds. */
function longJump(): BehaviorControl {
    return timedState('LongJumpToRandomPos', 20, {
        onStart: (context) => {
            context.body.brain.setMemory(MemoryModuleTypes.LONG_JUMP_MID_JUMP, true);
            context.body.jump();
            context.body.playSound(
                isScreamer(context.body)
                    ? 'minecraft:entity.goat.screaming_long_jump'
                    : 'minecraft:entity.goat.long_jump'
            );
        },
        onStop: (context) => {
            context.body.brain.eraseMemory(MemoryModuleTypes.LONG_JUMP_MID_JUMP);
            context.body.brain.setMemory(
                MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS,
                sample(GOAT.timeBetweenLongJumps, (bound) => context.world.randomInt(bound))
            );
        }
    });
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            swim(0.8),
            animalPanic(GOAT.speedWhenPanicking),
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.RAM_COOLDOWN_TICKS)
        ])
    );
}

/**
 * Java's `initIdleActivity`.
 *
 * Both cooldowns must be *present* for `idle` to be possible, which is the inverse of the usual
 * reading: a goat is idle precisely while it is still waiting out its ram and jump timers.
 */
function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        [
            [0, setEntityLookTargetSometimes(6, uniformInt(30, 60), (entity) => entity.type === 'minecraft:player')],
            [0, animalMakeLove('minecraft:goat')],
            [1, followTemptation(() => GOAT.speedWhenTempted)],
            [2, babyFollowAdult(GOAT.adultFollowRange, GOAT.speedWhenFollowingAdult)],
            [
                3,
                new RunOne([
                    [randomStroll(GOAT.speedWhenIdling), 2],
                    [setWalkTargetFromLookTarget(GOAT.speedWhenIdling, 3), 2],
                    [new DoNothing(30, 60), 1]
                ])
            ]
        ],
        {
            conditions: [
                [MemoryModuleTypes.RAM_COOLDOWN_TICKS, 'value_present'],
                [MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS, 'value_present']
            ]
        }
    );
}

function longJumpActivity(): ActivityData {
    return activityData(Activities.LONG_JUMP, [[0, longJump()]], {
        conditions: [
            [MemoryModuleTypes.TEMPTING_PLAYER, 'value_absent'],
            [MemoryModuleTypes.BREED_TARGET, 'value_absent'],
            [MemoryModuleTypes.WALK_TARGET, 'value_absent'],
            [MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS, 'value_absent']
        ]
    });
}

function ramActivity(): ActivityData {
    return activityData(
        Activities.RAM,
        [
            [0, ramTarget((screamer) => (screamer ? GOAT.timeBetweenRamsScreamer : GOAT.timeBetweenRams))],
            [
                1,
                prepareRamNearestTarget((screamer) =>
                    screamer ? GOAT.timeBetweenRamsScreamer.min : GOAT.timeBetweenRams.min
                )
            ]
        ],
        {
            conditions: [
                [MemoryModuleTypes.TEMPTING_PLAYER, 'value_absent'],
                [MemoryModuleTypes.BREED_TARGET, 'value_absent'],
                [MemoryModuleTypes.RAM_COOLDOWN_TICKS, 'value_absent']
            ]
        }
    );
}

export function goatActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), longJumpActivity(), ramActivity()];
}

export const GOAT_BRAIN: BrainMobDefinition = {
    id: 'minecraft:goat',
    memories: [],
    sensorTypes: [
        'nearest_living_entities',
        'nearest_players',
        'nearest_items',
        'nearest_adult',
        'hurt_by',
        'food_temptations'
    ],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new PlayerSensor(),
                new NearestItemSensor(),
                new AdultSensor(),
                new HurtBySensor(),
                TemptingSensor.forTag('minecraft:goat_food')
            ],
            activities: goatActivities()
        }),
    /** Java's `GoatAi.initMemories`: both cooldowns start full, so a fresh goat is idle. */
    initMemories: (context) => {
        context.body.brain.setMemory(
            MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS,
            sample(GOAT.timeBetweenLongJumps, (bound) => context.world.randomInt(bound))
        );
        context.body.brain.setMemory(
            MemoryModuleTypes.RAM_COOLDOWN_TICKS,
            sample(GOAT.timeBetweenRams, (bound) => context.world.randomInt(bound))
        );
    },
    updateActivity: (context) =>
        context.body.brain.setActiveActivityToFirstValid([Activities.RAM, Activities.LONG_JUMP, Activities.IDLE])
};
