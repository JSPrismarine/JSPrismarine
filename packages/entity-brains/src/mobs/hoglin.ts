/** The hoglin's brain. Transcribed from `HoglinAi` in the 26.3 server jar. */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { gatedBy } from '../behavior/builder.js';
import {
    animalMakeLove,
    babyFollowAdult,
    becomePassiveIfMemoryPresent,
    eraseMemoryIf,
    isBreeding,
    lookAtTargetSink,
    meleeAttack,
    moveToTargetSink,
    randomStroll,
    rangeOfSeconds,
    setEntityLookTargetSometimes,
    setWalkTargetAwayFrom,
    setWalkTargetFromAttackTargetIfTargetOutOfReach,
    setWalkTargetFromLookTarget,
    startAttacking,
    stopAttackingIfTargetInvalid,
    uniformInt
} from '../behavior/common.js';
import { DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import { AdultSensor, HoglinSpecificSensor, NearestLivingEntitySensor, PlayerSensor } from '../sensing/sensors.js';
import type { BrainContext, BrainEntity, BrainMob } from '../world.js';
import { bottomCenterOf } from '../world.js';

/** The named constants of `HoglinAi`. */
export const HOGLIN = {
    repellentDetectionRangeHorizontal: 8,
    repellentDetectionRangeVertical: 4,
    retreatDuration: rangeOfSeconds(5, 20),
    attackDuration: 200,
    desiredDistanceFromPiglinWhenIdling: 8,
    desiredDistanceFromPiglinWhenRetreating: 15,
    attackInterval: 40,
    babyAttackInterval: 15,
    repellentPacifyTime: 200,
    adultFollowRange: uniformInt(5, 16),
    speedWhenAvoidingRepellent: 1,
    speedWhenRetreating: 1.3,
    speedWhenMakingLove: 0.6,
    speedWhenIdling: 0.4,
    speedWhenFollowingAdult: 0.6,
    /** Both non-core activities start at priority 10. */
    activityBasePriority: 10
} as const;

const isAdult = (body: BrainMob): boolean => !body.baby;

/** Java's `HoglinAi.createIdleMovementBehaviors`, shared by `idle` and `avoid`. */
function idleMovementBehaviors(): RunOne {
    return new RunOne([
        [randomStroll(HOGLIN.speedWhenIdling), 2],
        [setWalkTargetFromLookTarget(HOGLIN.speedWhenIdling, 3), 2],
        [new DoNothing(30, 60), 1]
    ]);
}

/**
 * Java's `HoglinAi.findNearestValidAttackTarget`: a hoglin attacks the nearest targetable player
 * only when it is not pacified and not outnumbered.
 */
function findNearestValidAttackTarget(context: BrainContext): BrainEntity | undefined {
    if (context.body.brain.hasMemoryValue(MemoryModuleTypes.PACIFIED)) {
        return undefined;
    }
    return context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER);
}

/**
 * Java's `HoglinAi.piglinsOutnumberHoglins`, which decides whether a hoglin flees after a hit.
 *
 * The comparison is strict: ties favour the hoglin, which is why a one-on-one hoglin stands its
 * ground against a piglin.
 */
export function piglinsOutnumberHoglins(context: BrainContext): boolean {
    const piglins = context.body.brain.getMemory(MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT) ?? 0;
    const hoglins = (context.body.brain.getMemory(MemoryModuleTypes.VISIBLE_ADULT_HOGLIN_COUNT) ?? 0) + 1;
    return piglins > hoglins;
}

/** Java's `HoglinAi.wantsToStopFleeing`: an adult that is no longer outnumbered stops running. */
function wantsToStopFleeing(context: BrainContext): boolean {
    return isAdult(context.body) && !piglinsOutnumberHoglins(context);
}

function coreActivity(): ActivityData {
    return activityData(Activities.CORE, prioritized(0, [lookAtTargetSink(45, 90), moveToTargetSink()]));
}

function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        prioritized(HOGLIN.activityBasePriority, [
            becomePassiveIfMemoryPresent(MemoryModuleTypes.NEAREST_REPELLENT, HOGLIN.repellentPacifyTime),
            animalMakeLove('minecraft:hoglin', HOGLIN.speedWhenMakingLove, 2),
            setWalkTargetAwayFrom(
                MemoryModuleTypes.NEAREST_REPELLENT,
                bottomCenterOf,
                HOGLIN.speedWhenAvoidingRepellent,
                HOGLIN.desiredDistanceFromPiglinWhenIdling,
                true
            ),
            startAttacking(findNearestValidAttackTarget),
            gatedBy(
                isAdult,
                setWalkTargetAwayFrom(
                    MemoryModuleTypes.NEAREST_VISIBLE_ADULT_PIGLIN,
                    (entity) => entity.position,
                    HOGLIN.speedWhenIdling,
                    HOGLIN.desiredDistanceFromPiglinWhenIdling,
                    false
                )
            ),
            setEntityLookTargetSometimes(8, uniformInt(30, 60)),
            babyFollowAdult(HOGLIN.adultFollowRange, HOGLIN.speedWhenFollowingAdult),
            idleMovementBehaviors()
        ])
    );
}

/**
 * Java's `initFightActivity`.
 *
 * The two melee entries are the whole of the baby and adult split: an adult swings every 40 ticks
 * and a baby every 15, and `BehaviorBuilder.triggerIf` is what picks between them.
 */
function fightActivity(): ActivityData {
    return activityData(
        Activities.FIGHT,
        prioritized(HOGLIN.activityBasePriority, [
            becomePassiveIfMemoryPresent(MemoryModuleTypes.NEAREST_REPELLENT, HOGLIN.repellentPacifyTime),
            animalMakeLove('minecraft:hoglin', HOGLIN.speedWhenMakingLove, 2),
            setWalkTargetFromAttackTargetIfTargetOutOfReach(1),
            gatedBy(isAdult, meleeAttack(HOGLIN.attackInterval)),
            gatedBy((body) => body.baby, meleeAttack(HOGLIN.babyAttackInterval)),
            stopAttackingIfTargetInvalid(),
            eraseMemoryIf(isBreeding, MemoryModuleTypes.ATTACK_TARGET)
        ]),
        { gatedBy: MemoryModuleTypes.ATTACK_TARGET }
    );
}

function retreatActivity(): ActivityData {
    return activityData(
        Activities.AVOID,
        prioritized(HOGLIN.activityBasePriority, [
            setWalkTargetAwayFrom(
                MemoryModuleTypes.AVOID_TARGET,
                (entity) => entity.position,
                HOGLIN.speedWhenRetreating,
                HOGLIN.desiredDistanceFromPiglinWhenRetreating,
                false
            ),
            idleMovementBehaviors(),
            setEntityLookTargetSometimes(8, uniformInt(30, 60)),
            eraseMemoryIf((_body, context) => wantsToStopFleeing(context), MemoryModuleTypes.AVOID_TARGET)
        ]),
        { gatedBy: MemoryModuleTypes.AVOID_TARGET }
    );
}

/** The hoglin's four activities: the core package, `idle`, `fight` and the `avoid` retreat. */
export function hoglinActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), fightActivity(), retreatActivity()];
}

/**
 * The hoglin's registry entry. `updateActivity` also mirrors `ATTACK_TARGET` onto the `aggressive`
 * condition, which is what the client renders.
 */
export const HOGLIN_BRAIN: BrainMobDefinition = {
    id: 'minecraft:hoglin',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'nearest_players', 'nearest_adult', 'hoglin_specific_sensor'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new PlayerSensor(),
                new AdultSensor(),
                new HoglinSpecificSensor()
            ],
            activities: hoglinActivities()
        }),
    updateActivity: (context) => {
        const brain = context.body.brain;
        brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.AVOID, Activities.IDLE]);
        context.body.setCondition('aggressive', brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET));
    }
};
