/**
 * The creaking's brain. Transcribed from `CreakingAi` in the 26.3 server jar.
 *
 * The creaking is the one brain mob whose activity choice is overridden outside the activity
 * table: `updateActivity` falls back to the default activity whenever it cannot move, which is how
 * a watched creaking freezes mid-chase rather than picking a different activity.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import {
    has,
    lookAtTargetSink,
    meleeAttack,
    moveToTargetSink,
    randomStroll,
    setEntityLookTargetSometimes,
    setWalkTargetFromAttackTargetIfTargetOutOfReach,
    setWalkTargetFromLookTarget,
    startAttacking,
    stopAttackingIfTargetInvalid,
    swim,
    uniformInt
} from '../behavior/common.js';
import { DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import { NearestLivingEntitySensor, PlayerSensor } from '../sensing/sensors.js';
import { EntityCondition } from '../world.js';

/** The named constants of `CreakingAi`. */
export const CREAKING = {
    speedWhenIdling: 0.3,
    speedWhenFighting: 1,
    meleeAttackCooldown: 40,
    maxLookDistance: 8,
    gazeInterval: uniformInt(30, 60),
    /** Both non-core activities start at priority 10, unusually for a brain mob. */
    activityBasePriority: 10
} as const;

const canMove = (body: { conditions: ReadonlySet<string> }): boolean => body.conditions.has(EntityCondition.CAN_MOVE);

function coreActivity(): ActivityData {
    return activityData(Activities.CORE, prioritized(0, [swim(0.8), lookAtTargetSink(45, 90), moveToTargetSink()]));
}

function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        prioritized(CREAKING.activityBasePriority, [
            startAttacking(
                (context) => context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER),
                (context) => has(context.body, EntityCondition.ACTIVE)
            ),
            setEntityLookTargetSometimes(CREAKING.maxLookDistance, CREAKING.gazeInterval),
            new RunOne([
                [randomStroll(CREAKING.speedWhenIdling), 2],
                [setWalkTargetFromLookTarget(CREAKING.speedWhenIdling, 3), 2],
                [new DoNothing(30, 60), 1]
            ])
        ])
    );
}

/**
 * Java's `initFightActivity`.
 *
 * `isAttackTargetStillReachable` is not about pathing: it asks whether the target is still in
 * `NEAREST_VISIBLE_ATTACKABLE_PLAYERS`, so a creaking drops a player who stops being visible
 * rather than one it cannot walk to.
 */
function fightActivity(): ActivityData {
    return activityData(
        Activities.FIGHT,
        prioritized(CREAKING.activityBasePriority, [
            setWalkTargetFromAttackTargetIfTargetOutOfReach(CREAKING.speedWhenFighting),
            meleeAttack(CREAKING.meleeAttackCooldown, canMove),
            stopAttackingIfTargetInvalid({
                stopAttackingWhen: (context, target) =>
                    !(
                        context.body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYERS) ?? []
                    ).includes(target)
            })
        ]),
        { conditions: [[MemoryModuleTypes.ATTACK_TARGET, 'value_present']] }
    );
}

/** The creaking's three activities: the core package, `idle` and `fight`. */
export function creakingActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), fightActivity()];
}

/**
 * The creaking's registry entry. `updateActivity` falls back to the default activity while the
 * creaking cannot move, which is how a watched one freezes mid-chase.
 */
export const CREAKING_BRAIN: BrainMobDefinition = {
    id: 'minecraft:creaking',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'nearest_players'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [new NearestLivingEntitySensor(), new PlayerSensor()],
            activities: creakingActivities()
        }),
    updateActivity: (context) => {
        if (!canMove(context.body)) {
            context.body.brain.useDefaultActivity();
            return;
        }
        context.body.brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.IDLE]);
    }
};
