/**
 * The zoglin's brain. Transcribed from `Zoglin` in the 26.3 server jar.
 *
 * The zoglin is the one brain mob with no `<Mob>Ai` class: its three activities are static methods
 * on `Zoglin` itself, which is why a scan for `*Ai.class` finds only nineteen files for twenty
 * mobs.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { gatedBy } from '../behavior/builder.js';
import {
    lookAtTargetSink,
    meleeAttack,
    moveToTargetSink,
    randomStroll,
    setEntityLookTargetSometimes,
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
import { NearestLivingEntitySensor, PlayerSensor } from '../sensing/sensors.js';
import type { BrainContext, BrainEntity } from '../world.js';

/** The named constants of `Zoglin`. */
export const ZOGLIN = {
    maxHealth: 40,
    attackKnockback: 1,
    knockbackResistance: 0.6,
    attackDamage: 6,
    babyAttackDamage: 0.5,
    attackInterval: 40,
    babyAttackInterval: 15,
    attackDuration: 200,
    movementSpeedWhenFighting: 0.3,
    speedWhenIdling: 0.4,
    activityBasePriority: 10
} as const;

/**
 * Java's `Zoglin.findNearestValidAttackTarget`: the closest visible entity that is neither a
 * zoglin nor a creeper.
 *
 * Creepers are excluded by name, not by tag: a zoglin that could attack creepers would blow up
 * every nether portal it guards.
 */
function findNearestValidAttackTarget(context: BrainContext): BrainEntity | undefined {
    return context.body.brain
        .getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
        ?.findClosest(
            (entity) =>
                entity.type !== 'minecraft:zoglin' &&
                entity.type !== 'minecraft:creeper' &&
                context.world.isAttackable(context.body, entity)
        );
}

function coreActivity(): ActivityData {
    return activityData(Activities.CORE, prioritized(0, [lookAtTargetSink(45, 90), moveToTargetSink()]));
}

function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        prioritized(ZOGLIN.activityBasePriority, [
            startAttacking(findNearestValidAttackTarget),
            setEntityLookTargetSometimes(8, uniformInt(30, 60)),
            new RunOne([
                [randomStroll(ZOGLIN.speedWhenIdling), 2],
                [setWalkTargetFromLookTarget(ZOGLIN.speedWhenIdling, 3), 2],
                [new DoNothing(30, 60), 1]
            ])
        ])
    );
}

function fightActivity(): ActivityData {
    return activityData(
        Activities.FIGHT,
        prioritized(ZOGLIN.activityBasePriority, [
            setWalkTargetFromAttackTargetIfTargetOutOfReach(1),
            gatedBy((body) => !body.baby, meleeAttack(ZOGLIN.attackInterval)),
            gatedBy((body) => body.baby, meleeAttack(ZOGLIN.babyAttackInterval)),
            stopAttackingIfTargetInvalid()
        ]),
        { gatedBy: MemoryModuleTypes.ATTACK_TARGET }
    );
}

/** The zoglin's three activities: the core package, `idle` and `fight`. */
export function zoglinActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), fightActivity()];
}

/** The zoglin's registry entry. Two sensors and no starting memories: it attacks whatever it can see. */
export const ZOGLIN_BRAIN: BrainMobDefinition = {
    id: 'minecraft:zoglin',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'nearest_players'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [new NearestLivingEntitySensor(), new PlayerSensor()],
            activities: zoglinActivities()
        }),
    updateActivity: (context) => {
        context.body.brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.IDLE]);
        context.body.setCondition('aggressive', context.body.brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET));
    }
};
