/**
 * The happy ghast's brain. Transcribed from `HappyGhastAi` in the 26.3 server jar.
 *
 * The happy ghast is the second of the two mobs that carry both AI systems, and it is the clearer
 * of the two: its brain is 67 lines and holds only idling and following, while its goals run the
 * harness, the riding and the flight control. Its `panic` activity is the most striking thing in
 * the table, because it has no behaviors at all: it exists so that `IS_PANICKING` suppresses every
 * idle behavior while the core activity's `AnimalPanic` flies the ghast away.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { countDownCooldownTicks } from '../behavior/builder.js';
import {
    animalPanic,
    babyFollowAdult,
    followTemptation,
    lookAtTargetSink,
    moveToTargetSink,
    randomStroll,
    setWalkTargetFromLookTarget,
    swim,
    uniformInt
} from '../behavior/common.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import {
    AdultSensorAnyType,
    HurtBySensor,
    NearestLivingEntitySensor,
    PlayerSensor,
    TemptingSensor
} from '../sensing/sensors.js';

/** The named constants of `HappyGhastAi`. */
export const HAPPY_GHAST = {
    speedWhenIdling: 1,
    speedWhenTempted: 1.25,
    speedWhenFollowingAdult: 1.1,
    babyCloseEnoughDist: 3,
    adultFollowRange: uniformInt(3, 16),
    /** `new AnimalPanic(2.0F, 0)`: the second argument is the fly height offset. */
    speedWhenPanicking: 2,
    panicFlyHeight: 0
} as const;

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            swim(0.8),
            animalPanic(HAPPY_GHAST.speedWhenPanicking, { flyHeight: HAPPY_GHAST.panicFlyHeight }),
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS)
        ])
    );
}

/**
 * Java's `initIdleActivity`.
 *
 * The two `BabyFollowAdult` entries differ only in their memory: priority 2 follows the nearest
 * visible *player* and priority 3 the nearest visible adult, so a baby happy ghast prefers a
 * person to its own kind.
 */
function idleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [
            1,
            followTemptation(
                () => HAPPY_GHAST.speedWhenTempted,
                () => HAPPY_GHAST.babyCloseEnoughDist
            )
        ],
        [
            2,
            babyFollowAdult(
                HAPPY_GHAST.adultFollowRange,
                () => HAPPY_GHAST.speedWhenFollowingAdult,
                MemoryModuleTypes.NEAREST_VISIBLE_PLAYER
            )
        ],
        [
            3,
            babyFollowAdult(
                HAPPY_GHAST.adultFollowRange,
                () => HAPPY_GHAST.speedWhenFollowingAdult,
                MemoryModuleTypes.NEAREST_VISIBLE_ADULT
            )
        ],
        [
            4,
            new RunOne([
                [randomStroll(HAPPY_GHAST.speedWhenIdling, 'air'), 1],
                [setWalkTargetFromLookTarget(HAPPY_GHAST.speedWhenIdling, 3), 1]
            ])
        ]
    ]);
}

/** Java's `initPanicActivity`: no behaviors, gated on `IS_PANICKING`. */
function panicActivity(): ActivityData {
    return activityData(Activities.PANIC, [], {
        conditions: [[MemoryModuleTypes.IS_PANICKING, 'value_present']]
    });
}

/** The happy ghast's three activities: the core package, `idle`, and the empty `panic` that suppresses idling. */
export function happyGhastActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), panicActivity()];
}

/**
 * The happy ghast's registry entry. `alsoRunsGoals` is true: the harness, the riding and the
 * flight control stay on the goal system.
 */
export const HAPPY_GHAST_BRAIN: BrainMobDefinition = {
    id: 'minecraft:happy_ghast',
    memories: [],
    sensorTypes: [
        'nearest_living_entities',
        'hurt_by',
        'food_temptations',
        'nearest_adult_any_type',
        'nearest_players'
    ],
    alsoRunsGoals: true,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new HurtBySensor(),
                TemptingSensor.forTag('minecraft:happy_ghast_food'),
                new AdultSensorAnyType(),
                new PlayerSensor()
            ],
            activities: happyGhastActivities()
        }),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.PANIC, Activities.IDLE])
};
