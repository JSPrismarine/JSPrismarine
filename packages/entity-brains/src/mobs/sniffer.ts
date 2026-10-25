/**
 * The sniffer's brain. Transcribed from `SnifferAi` in the 26.3 server jar.
 *
 * The sniffer is a five-state animation machine driven entirely by memories: `SNIFFER_HAPPY`,
 * `SNIFFER_DIGGING`, `SNIFFER_SNIFFING_TARGET`, `SNIFFER_EXPLORED_POSITIONS` and `SNIFF_COOLDOWN`
 * exist only for it, and the `sniff` and `dig` activities are gated on three memories each rather
 * than on anything about the world.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { countDownCooldownTicks } from '../behavior/builder.js';
import {
    animalMakeLove,
    animalPanic,
    followTemptation,
    has,
    lookAtTargetSink,
    moveToTargetSink,
    ofType,
    randomStroll,
    setEntityLookTarget,
    setWalkTargetFromLookTarget,
    swim
} from '../behavior/common.js';
import type { BehaviorControl, BehaviorHooks } from '../behavior/control.js';
import { Behavior, conditions, DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes, UNIT } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import { HurtBySensor, NearestLivingEntitySensor, PlayerSensor, TemptingSensor } from '../sensing/sensors.js';
import type { BrainContext } from '../world.js';
import { blockContaining, blockPosTracker, EntityCondition } from '../world.js';

/** The named constants of `SnifferAi` and its five inner behaviors. */
export const SNIFFER = {
    maxLookDistance: 6,
    sniffingCooldownTicks: 9600,
    speedWhenIdling: 1,
    speedWhenPanicking: 2,
    speedWhenSniffing: 1.25,
    speedWhenTempted: 1.25,
    /** `new MoveToTargetSink(500, 700)`: by far the longest sink timeout of the twenty mobs. */
    moveToTargetSink: { minDuration: 500, maxDuration: 700 },
    searchingDuration: 600,
    diggingDuration: { min: 160, max: 180 },
    finishedDiggingDuration: 40,
    feelingHappyDuration: { min: 40, max: 100 },
    scentingDuration: { min: 40, max: 80 },
    sniffingDuration: { min: 40, max: 80 }
} as const;

/** Java's `SnifferAi.resetSniffing`: drops both dig memories and returns the sniffer to idling. */
export function resetSniffing(context: BrainContext): void {
    context.body.brain.eraseMemory(MemoryModuleTypes.SNIFFER_DIGGING);
    context.body.brain.eraseMemory(MemoryModuleTypes.SNIFFER_SNIFFING_TARGET);
}

/**
 * Java's `SnifferAi.Sniffing`: nose in the air, then a dig position.
 *
 * It only writes `SNIFFER_SNIFFING_TARGET` when it ran its whole duration, so a sniffer that is
 * interrupted does not pick a spot.
 */
function sniffing(): BehaviorControl {
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) => !context.body.baby && has(context.body, EntityCondition.CAN_SNIFF),
        canStillUse: (context) => has(context.body, EntityCondition.CAN_SNIFF),
        stop: (context) => {
            const spot = context.world.randomPos(context.body, { xzRange: 8, yRange: 2, medium: 'land' });
            if (spot === undefined) {
                return;
            }
            const pos = blockContaining(spot);
            context.body.brain.setMemory(MemoryModuleTypes.SNIFFER_SNIFFING_TARGET, pos);
            context.body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                target: blockPosTracker(pos),
                speedModifier: SNIFFER.speedWhenSniffing,
                closeEnoughDist: 0
            });
        }
    };
    return new Behavior(
        'Sniffing',
        conditions(
            [MemoryModuleTypes.WALK_TARGET, 'value_absent'],
            [MemoryModuleTypes.SNIFFER_SNIFFING_TARGET, 'value_absent'],
            [MemoryModuleTypes.SNIFF_COOLDOWN, 'value_absent']
        ),
        hooks,
        { minDuration: SNIFFER.sniffingDuration.min, maxDuration: SNIFFER.sniffingDuration.max }
    );
}

/** Java's `SnifferAi.Searching`: walk to the sniffing target, and dig on arrival. */
function searching(): BehaviorControl {
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) => has(context.body, EntityCondition.CAN_SNIFF),
        canStillUse: (context) => {
            if (!has(context.body, EntityCondition.CAN_SNIFF)) {
                return false;
            }
            const walking = context.body.brain.getMemory(MemoryModuleTypes.WALK_TARGET)?.target.currentBlockPosition();
            const sniffing_ = context.body.brain.getMemory(MemoryModuleTypes.SNIFFER_SNIFFING_TARGET);
            return (
                walking !== undefined &&
                sniffing_ !== undefined &&
                walking.x === sniffing_.x &&
                walking.y === sniffing_.y &&
                walking.z === sniffing_.z
            );
        },
        stop: (context) => {
            if (has(context.body, EntityCondition.CAN_DIG) && has(context.body, EntityCondition.CAN_SNIFF)) {
                context.body.brain.setMemory(MemoryModuleTypes.SNIFFER_DIGGING, true);
            }
            context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            context.body.brain.eraseMemory(MemoryModuleTypes.SNIFFER_SNIFFING_TARGET);
        }
    };
    return new Behavior(
        'Searching',
        conditions(
            [MemoryModuleTypes.WALK_TARGET, 'value_present'],
            [MemoryModuleTypes.IS_PANICKING, 'value_absent'],
            [MemoryModuleTypes.SNIFFER_SNIFFING_TARGET, 'value_present']
        ),
        hooks,
        { minDuration: SNIFFER.searchingDuration, maxDuration: SNIFFER.searchingDuration }
    );
}

/**
 * Java's `SnifferAi.Digging`.
 *
 * Finishing the dig arms a 9600-tick `SNIFF_COOLDOWN`, eight real-world minutes; being interrupted
 * resets the sniffing memories instead and leaves the cooldown clear.
 */
function digging(): BehaviorControl {
    let endTimestamp = 0;
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) => has(context.body, EntityCondition.CAN_SNIFF),
        canStillUse: (context) =>
            context.body.brain.hasMemoryValue(MemoryModuleTypes.SNIFFER_DIGGING) &&
            has(context.body, EntityCondition.CAN_DIG) &&
            !has(context.body, EntityCondition.IN_LOVE),
        start: (_context, timestamp) => {
            endTimestamp = timestamp + SNIFFER.diggingDuration.min;
        },
        stop: (context, timestamp) => {
            if (timestamp > endTimestamp) {
                context.body.brain.setMemoryWithExpiry(
                    MemoryModuleTypes.SNIFF_COOLDOWN,
                    UNIT,
                    SNIFFER.sniffingCooldownTicks
                );
            } else {
                resetSniffing(context);
            }
        }
    };
    return new Behavior(
        'Digging',
        conditions(
            [MemoryModuleTypes.IS_PANICKING, 'value_absent'],
            [MemoryModuleTypes.WALK_TARGET, 'value_absent'],
            [MemoryModuleTypes.SNIFFER_DIGGING, 'value_present'],
            [MemoryModuleTypes.SNIFF_COOLDOWN, 'value_absent']
        ),
        hooks,
        { minDuration: SNIFFER.diggingDuration.min, maxDuration: SNIFFER.diggingDuration.max }
    );
}

/** Java's `SnifferAi.FinishedDigging`: rise, drop the seed, and become happy. */
function finishedDigging(): BehaviorControl {
    const hooks: BehaviorHooks = {
        canStillUse: (context) => context.body.brain.hasMemoryValue(MemoryModuleTypes.SNIFFER_DIGGING),
        stop: (context) => {
            context.world.emitGameEvent('minecraft:block_place', context.body.position, context.body);
            context.body.brain.eraseMemory(MemoryModuleTypes.SNIFFER_DIGGING);
            context.body.brain.setMemory(MemoryModuleTypes.SNIFFER_HAPPY, true);
        }
    };
    return new Behavior(
        'FinishedDigging',
        conditions(
            [MemoryModuleTypes.IS_PANICKING, 'value_absent'],
            [MemoryModuleTypes.WALK_TARGET, 'value_absent'],
            [MemoryModuleTypes.SNIFFER_DIGGING, 'value_present'],
            [MemoryModuleTypes.SNIFF_COOLDOWN, 'value_present']
        ),
        hooks,
        { minDuration: SNIFFER.finishedDiggingDuration, maxDuration: SNIFFER.finishedDiggingDuration }
    );
}

/** Java's `SnifferAi.FeelingHappy`: the animation after a successful dig. */
function feelingHappy(): BehaviorControl {
    const hooks: BehaviorHooks = {
        canStillUse: () => true,
        stop: (context) => context.body.brain.eraseMemory(MemoryModuleTypes.SNIFFER_HAPPY)
    };
    return new Behavior('FeelingHappy', conditions([MemoryModuleTypes.SNIFFER_HAPPY, 'value_present']), hooks, {
        minDuration: SNIFFER.feelingHappyDuration.min,
        maxDuration: SNIFFER.feelingHappyDuration.max
    });
}

/** Java's `SnifferAi.Scenting`: the idle sniff, which leads nowhere. */
function scenting(): BehaviorControl {
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) => !context.body.brain.hasMemoryValue(MemoryModuleTypes.TEMPTING_PLAYER),
        canStillUse: () => true
    };
    return new Behavior(
        'Scenting',
        conditions(
            [MemoryModuleTypes.IS_PANICKING, 'value_absent'],
            [MemoryModuleTypes.SNIFFER_DIGGING, 'value_absent'],
            [MemoryModuleTypes.SNIFFER_SNIFFING_TARGET, 'value_absent'],
            [MemoryModuleTypes.SNIFFER_HAPPY, 'value_absent'],
            [MemoryModuleTypes.BREED_TARGET, 'value_absent']
        ),
        hooks,
        { minDuration: SNIFFER.scentingDuration.min, maxDuration: SNIFFER.scentingDuration.max }
    );
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            swim(0.8),
            animalPanic(SNIFFER.speedWhenPanicking, { onStart: resetSniffing }),
            moveToTargetSink(SNIFFER.moveToTargetSink),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS)
        ])
    );
}

/** The sniffer is the one mob whose `LookAtTargetSink` is in `idle` rather than `core`. */
function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        [
            [0, animalMakeLove('minecraft:sniffer')],
            [
                1,
                followTemptation(
                    () => SNIFFER.speedWhenTempted,
                    (body) => (body.baby ? 2.5 : 3.5)
                )
            ],
            [2, lookAtTargetSink(45, 90)],
            [3, feelingHappy()],
            [
                4,
                new RunOne([
                    [setWalkTargetFromLookTarget(SNIFFER.speedWhenIdling, 3), 2],
                    [scenting(), 1],
                    [sniffing(), 1],
                    [setEntityLookTarget(ofType('minecraft:player'), SNIFFER.maxLookDistance), 1],
                    [randomStroll(SNIFFER.speedWhenIdling), 1],
                    [new DoNothing(5, 20), 2]
                ])
            ]
        ],
        { conditions: [[MemoryModuleTypes.SNIFFER_DIGGING, 'value_absent']] }
    );
}

function sniffingActivity(): ActivityData {
    return activityData(Activities.SNIFF, [[0, searching()]], {
        conditions: [
            [MemoryModuleTypes.IS_PANICKING, 'value_absent'],
            [MemoryModuleTypes.SNIFFER_SNIFFING_TARGET, 'value_present'],
            [MemoryModuleTypes.WALK_TARGET, 'value_present']
        ]
    });
}

/** Both dig behaviors sit at priority 0; `SNIFF_COOLDOWN` is what tells them apart. */
function digActivity(): ActivityData {
    return activityData(
        Activities.DIG,
        [
            [0, digging()],
            [0, finishedDigging()]
        ],
        {
            conditions: [
                [MemoryModuleTypes.IS_PANICKING, 'value_absent'],
                [MemoryModuleTypes.WALK_TARGET, 'value_absent'],
                [MemoryModuleTypes.SNIFFER_DIGGING, 'value_present']
            ]
        }
    );
}

export function snifferActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), sniffingActivity(), digActivity()];
}

export const SNIFFER_BRAIN: BrainMobDefinition = {
    id: 'minecraft:sniffer',
    memories: [MemoryModuleTypes.SNIFFER_EXPLORED_POSITIONS],
    sensorTypes: ['nearest_living_entities', 'hurt_by', 'nearest_players', 'food_temptations'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            memories: SNIFFER_BRAIN.memories,
            sensors: [
                new NearestLivingEntitySensor(),
                new HurtBySensor(),
                new PlayerSensor(),
                TemptingSensor.forTag('minecraft:sniffer_food')
            ],
            activities: snifferActivities()
        }),
    updateActivity: (context) =>
        context.body.brain.setActiveActivityToFirstValid([Activities.DIG, Activities.SNIFF, Activities.IDLE])
};
