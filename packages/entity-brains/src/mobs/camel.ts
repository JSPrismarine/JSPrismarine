/**
 * The camel's brain. Transcribed from `CamelAi` in the 26.3 server jar.
 *
 * The camel is one of the two mobs that carry both AI systems: `Camel` has a `registerGoals` and a
 * `brainProvider`. Its brain runs the idling, sitting and temptation; its goals run riding,
 * leashing and breeding interaction. {@link CAMEL_BRAIN} reports that through `alsoRunsGoals`.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { countDownCooldownTicks, gatedBy } from '../behavior/builder.js';
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
import { AdultSensor, HurtBySensor, NearestLivingEntitySensor, TemptingSensor } from '../sensing/sensors.js';
import { EntityCondition } from '../world.js';

/** The named constants of `CamelAi`. */
export const CAMEL = {
    speedWhenPanicking: 4,
    speedWhenIdling: 2,
    speedWhenTempted: 2.5,
    speedWhenFollowingAdult: 2.5,
    speedWhenMakingLove: 1,
    adultFollowRange: uniformInt(5, 16),
    /** `new CamelAi.RandomSitting(20)`: twenty seconds in the current pose before it may change. */
    minimalPoseSeconds: 20,
    temptedCloseEnoughBaby: 2.5,
    temptedCloseEnoughAdult: 3.5
} as const;

const canMove = (body: { conditions: ReadonlySet<string> }): boolean =>
    !body.conditions.has(EntityCondition.REFUSE_TO_MOVE);

/**
 * Java's `CamelAi.RandomSitting`: flips the camel between standing and sitting.
 *
 * It only fires after the camel has held its pose for twenty seconds, is on the ground, is not in
 * water, is not leashed and has no rider, and it never sits down while panicking.
 */
function randomSitting(minimalPoseSeconds: number): BehaviorControl {
    const minimalPoseTicks = minimalPoseSeconds * 20;
    let poseTicks = 0;
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) => {
            poseTicks++;
            return (
                !has(context.body, EntityCondition.IN_WATER) &&
                poseTicks >= minimalPoseTicks &&
                !has(context.body, EntityCondition.LEASHED) &&
                has(context.body, EntityCondition.ON_GROUND)
            );
        },
        start: (context) => {
            poseTicks = 0;
            if (has(context.body, EntityCondition.SITTING)) {
                context.body.setCondition(EntityCondition.SITTING, false);
            } else if (!context.body.brain.hasMemoryValue(MemoryModuleTypes.IS_PANICKING)) {
                context.body.setCondition(EntityCondition.SITTING, true);
            }
        }
    };
    return new Behavior('RandomSitting', conditions(), hooks);
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            swim(0.8),
            animalPanic(CAMEL.speedWhenPanicking, {
                onStart: (context) => context.body.setCondition(EntityCondition.SITTING, false)
            }),
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.GAZE_COOLDOWN_TICKS)
        ])
    );
}

function idleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [0, setEntityLookTargetSometimes(6, uniformInt(30, 60), (entity) => entity.type === 'minecraft:player')],
        [1, animalMakeLove('minecraft:camel')],
        [
            2,
            new RunOne([
                [
                    followTemptation(
                        () => CAMEL.speedWhenTempted,
                        (body) => (body.baby ? CAMEL.temptedCloseEnoughBaby : CAMEL.temptedCloseEnoughAdult)
                    ),
                    1
                ],
                [gatedBy(canMove, babyFollowAdult(CAMEL.adultFollowRange, CAMEL.speedWhenFollowingAdult)), 1]
            ])
        ],
        [3, randomLookAround(uniformInt(150, 250), 30, 0, 0)],
        [
            4,
            new RunOne(
                [
                    [gatedBy(canMove, randomStroll(CAMEL.speedWhenIdling)), 1],
                    [gatedBy(canMove, setWalkTargetFromLookTarget(CAMEL.speedWhenIdling, 3)), 1],
                    [randomSitting(CAMEL.minimalPoseSeconds), 1],
                    [new DoNothing(30, 60), 1]
                ],
                conditions([MemoryModuleTypes.WALK_TARGET, 'value_absent'])
            )
        ]
    ]);
}

/** The camel's two activities: the core package and `idle`. Its goals run everything else. */
export function camelActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity()];
}

/** The camel's registry entry. `alsoRunsGoals` is true, so riding, leashing and breeding stay on the goal system. */
export const CAMEL_BRAIN: BrainMobDefinition = {
    id: 'minecraft:camel',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'hurt_by', 'food_temptations', 'nearest_adult'],
    alsoRunsGoals: true,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new HurtBySensor(),
                TemptingSensor.forTag('minecraft:camel_food'),
                new AdultSensor()
            ],
            activities: camelActivities()
        }),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.IDLE])
};
