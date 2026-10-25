/** The tadpole's brain. Transcribed from `TadpoleAi` in the 26.3 server jar. */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { countDownCooldownTicks, triggerIf } from '../behavior/builder.js';
import {
    animalPanic,
    followTemptation,
    has,
    lookAtTargetSink,
    moveToTargetSink,
    randomStroll,
    setEntityLookTargetSometimes,
    setWalkTargetFromLookTarget,
    uniformInt
} from '../behavior/common.js';
import { conditions } from '../behavior/control.js';
import { GateBehavior } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import { HurtBySensor, NearestLivingEntitySensor, PlayerSensor, TemptingSensor } from '../sensing/sensors.js';
import { EntityCondition } from '../world.js';
import { FROG } from './frog.js';

/** The named constants of `TadpoleAi`. */
export const TADPOLE = {
    speedWhenPanicking: 2,
    speedWhenIdlingInWater: 0.5,
    speedWhenTempted: 1.25
} as const;

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            animalPanic(TADPOLE.speedWhenPanicking),
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS)
        ])
    );
}

function idleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [0, setEntityLookTargetSometimes(6, uniformInt(30, 60), (entity) => entity.type === 'minecraft:player')],
        [1, followTemptation(() => TADPOLE.speedWhenTempted)],
        [
            2,
            new GateBehavior(
                'ordered',
                'try_all',
                [
                    [randomStroll(TADPOLE.speedWhenIdlingInWater, 'water'), 2],
                    [setWalkTargetFromLookTarget(TADPOLE.speedWhenIdlingInWater, 3), 3],
                    [triggerIf('IsInWater', (body) => has(body, EntityCondition.IN_WATER)), 5]
                ],
                { entryCondition: conditions([MemoryModuleTypes.WALK_TARGET, 'value_absent']) }
            )
        ]
    ]);
}

/** The tadpole's two activities: the core package and `idle`. */
export function tadpoleActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity()];
}

/** The tadpole's registry entry. It shares the frog's temptation sensor and has only `idle` to pick. */
export const TADPOLE_BRAIN: BrainMobDefinition = {
    id: 'minecraft:tadpole',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'nearest_players', 'hurt_by', 'frog_temptations'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new PlayerSensor(),
                new HurtBySensor(),
                TemptingSensor.forTag(FROG.temptationTag)
            ],
            activities: tadpoleActivities()
        }),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.IDLE])
};
