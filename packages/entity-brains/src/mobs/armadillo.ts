/** The armadillo's brain. Transcribed from `ArmadilloAi` in the 26.3 server jar. */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { behavior, countDownCooldownTicks } from '../behavior/builder.js';
import {
    animalMakeLove,
    animalPanic,
    babyFollowAdult,
    followTemptation,
    has,
    lookAtTargetSink,
    moveToTargetSink,
    randomLookAround,
    randomStroll,
    setEntityLookTargetSometimes,
    setWalkTargetFromLookTarget,
    swim,
    uniformInt
} from '../behavior/common.js';
import type { BehaviorControl, BehaviorHooks } from '../behavior/control.js';
import { Behavior, conditions, DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import {
    ARMADILLO_SCARE_SENSOR,
    HurtBySensor,
    AdultSensor,
    MobSensor,
    NearestLivingEntitySensor,
    TemptingSensor
} from '../sensing/sensors.js';
import type { BrainContext } from '../world.js';
import { EntityCondition } from '../world.js';

/** The named constants of `ArmadilloAi` and `ArmadilloAi.ArmadilloBallUp`. */
export const ARMADILLO = {
    speedWhenPanicking: 2,
    speedWhenIdling: 1,
    speedWhenTempted: 1.25,
    speedWhenFollowingAdult: 1.25,
    speedWhenMakingLove: 1,
    defaultCloseEnoughDist: 2,
    babyCloseEnoughDist: 1,
    adultFollowRange: uniformInt(5, 16),
    /** `5 * TimeUtil.SECONDS_PER_MINUTE * 20`, five minutes of staying balled up. */
    ballUpStayInState: 5 * 60 * 20,
    ticksDelayToDetermineIfDangerIsStillAround: 5,
    /** Below this much time left on `DANGER_DETECTED_RECENTLY`, the armadillo unrolls. */
    dangerDetectedRecentlyDangerThreshold: 75,
    peekTimer: uniformInt(100, 400),
    /** Java's `SensorType.ARMADILLO_SCARE_DETECTED` arguments. */
    scareScanRate: ARMADILLO_SCARE_SENSOR.scanRate,
    scareMemoryTimeToLive: ARMADILLO_SCARE_SENSOR.memoryTimeToLive
} as const;

/**
 * Java's `ARMADILLO_ROLLING_OUT`, a `BehaviorBuilder` one-shot in the core activity.
 *
 * It reads oddly: the behavior requires `DANGER_DETECTED_RECENTLY` to be absent and then unrolls a
 * scared armadillo, so it is the counterpart to the `panic` activity's ball-up rather than part of
 * it.
 */
function rollingOut() {
    return behavior('ArmadilloRollingOut')
        .absent(MemoryModuleTypes.DANGER_DETECTED_RECENTLY)
        .build((context) => {
            if (!has(context.body, EntityCondition.SCARED)) {
                return false;
            }
            context.body.setCondition(EntityCondition.SCARED, false);
            return true;
        });
}

/**
 * Java's `ArmadilloAi.ArmadilloBallUp`: five minutes of being a ball, peeking now and then.
 *
 * The unroll trigger is the time left on `DANGER_DETECTED_RECENTLY`, not its presence: the
 * armadillo starts unrolling once fewer than the unroll animation's duration of ticks remain, and
 * peeks whenever more than 75 remain and the peek timer has elapsed.
 */
function ballUp(): BehaviorControl {
    let nextPeekTimer = 0;
    let dangerWasAround = false;
    const pickNextPeekTimer = (context: BrainContext): number =>
        ARMADILLO.peekTimer.min + context.world.randomInt(ARMADILLO.peekTimer.max - ARMADILLO.peekTimer.min + 1);
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) =>
            has(context.body, EntityCondition.ON_GROUND) && !has(context.body, EntityCondition.IN_WATER),
        canStillUse: (context) => has(context.body, EntityCondition.SCARED),
        start: (context) => context.body.setCondition(EntityCondition.SCARED, true),
        stop: (context) => context.body.setCondition(EntityCondition.SCARED, false),
        tick: (context) => {
            if (nextPeekTimer > 0) {
                nextPeekTimer--;
            }
            const dangerTicks = context.body.brain.getTimeUntilExpiry(MemoryModuleTypes.DANGER_DETECTED_RECENTLY);
            const dangerIsAround = dangerTicks > ARMADILLO.dangerDetectedRecentlyDangerThreshold;
            if (dangerIsAround !== dangerWasAround) {
                nextPeekTimer = pickNextPeekTimer(context);
            }
            dangerWasAround = dangerIsAround;
            if (nextPeekTimer === 0 && has(context.body, EntityCondition.ON_GROUND) && dangerIsAround) {
                context.world.emitGameEvent('minecraft:entity_action', context.body.position, context.body);
                nextPeekTimer = pickNextPeekTimer(context);
            }
        }
    };
    return new Behavior('ArmadilloBallUp', conditions(), hooks, {
        minDuration: ARMADILLO.ballUpStayInState,
        maxDuration: ARMADILLO.ballUpStayInState
    });
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            swim(0.8),
            animalPanic(ARMADILLO.speedWhenPanicking, {
                panicCausingDamageTypes: 'minecraft:panic_environmental_causes',
                onStart: (context) => context.body.setCondition(EntityCondition.SCARED, false)
            }),
            lookAtTargetSink(45, 90),
            moveToTargetSink({
                extraStartConditions: (context) => !has(context.body, EntityCondition.SCARED)
            }),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.GAZE_COOLDOWN_TICKS),
            rollingOut()
        ])
    );
}

function idleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [0, setEntityLookTargetSometimes(6, uniformInt(30, 60), (entity) => entity.type === 'minecraft:player')],
        [1, animalMakeLove('minecraft:armadillo', ARMADILLO.speedWhenMakingLove, 1)],
        [
            2,
            new RunOne([
                [
                    followTemptation(
                        () => ARMADILLO.speedWhenTempted,
                        (body) => (body.baby ? ARMADILLO.babyCloseEnoughDist : ARMADILLO.defaultCloseEnoughDist)
                    ),
                    1
                ],
                [babyFollowAdult(ARMADILLO.adultFollowRange, ARMADILLO.speedWhenFollowingAdult), 1]
            ])
        ],
        [3, randomLookAround(uniformInt(150, 250), 30, 0, 0)],
        [
            4,
            new RunOne(
                [
                    [randomStroll(ARMADILLO.speedWhenIdling), 1],
                    [setWalkTargetFromLookTarget(ARMADILLO.speedWhenIdling, 3), 1],
                    [new DoNothing(30, 60), 1]
                ],
                conditions([MemoryModuleTypes.WALK_TARGET, 'value_absent'])
            )
        ]
    ]);
}

/**
 * Java's `initScaredActivity`, registered as `panic`.
 *
 * It needs `DANGER_DETECTED_RECENTLY` present and `IS_PANICKING` absent, so an armadillo that is
 * fleeing environmental damage never balls up at the same time.
 */
function scaredActivity(): ActivityData {
    return activityData(Activities.PANIC, [[0, ballUp()]], {
        conditions: [
            [MemoryModuleTypes.DANGER_DETECTED_RECENTLY, 'value_present'],
            [MemoryModuleTypes.IS_PANICKING, 'value_absent']
        ]
    });
}

export function armadilloActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), scaredActivity()];
}

/** Java's `Armadillo.isScaredBy`: an undead or a sprinting player within the scare box. */
function isScaredBy(entity: { type: string; typeTags: ReadonlySet<string> }): boolean {
    return entity.type === 'minecraft:player' || entity.typeTags.has('minecraft:undead');
}

export const ARMADILLO_BRAIN: BrainMobDefinition = {
    id: 'minecraft:armadillo',
    memories: [],
    sensorTypes: [
        'nearest_living_entities',
        'hurt_by',
        'food_temptations',
        'nearest_adult',
        'armadillo_scare_detected'
    ],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new HurtBySensor(),
                TemptingSensor.forTag('minecraft:armadillo_food'),
                new AdultSensor(),
                new MobSensor(
                    ARMADILLO.scareScanRate,
                    (_context, entity) => isScaredBy(entity),
                    (context) => !has(context.body, EntityCondition.IN_WATER),
                    MemoryModuleTypes.DANGER_DETECTED_RECENTLY,
                    ARMADILLO.scareMemoryTimeToLive
                )
            ],
            activities: armadilloActivities()
        }),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.PANIC, Activities.IDLE])
};
