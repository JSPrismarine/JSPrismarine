/**
 * The piglin brute's brain. Transcribed from `PiglinBruteAi` in the 26.3 server jar.
 *
 * The brute is the piglin with everything about gold removed: no admiring, no bartering, no
 * celebrating, no riding. What it adds is `HOME`, written once when it spawns, which is what keeps
 * a brute inside its bastion.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { behavior } from '../behavior/builder.js';
import {
    interactWith,
    interactWithDoor,
    lookAtTargetSink,
    meleeAttack,
    moveToTargetSink,
    ofType,
    randomStroll,
    setEntityLookTarget,
    setLookAndInteract,
    setWalkTargetFromAttackTargetIfTargetOutOfReach,
    startAttacking,
    stopAttackingIfTargetInvalid,
    strollAroundPoi,
    strollToPoi
} from '../behavior/common.js';
import type { BehaviorControl } from '../behavior/control.js';
import { DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import {
    HurtBySensor,
    NearestItemSensor,
    NearestLivingEntitySensor,
    PiglinBruteSpecificSensor,
    PlayerSensor
} from '../sensing/sensors.js';
import type { BrainContext, BrainEntity } from '../world.js';
import { blockContaining } from '../world.js';

/** The named constants of `PiglinBruteAi`. */
export const PIGLIN_BRUTE = {
    angerDuration: 600,
    meleeAttackCooldown: 20,
    activitySoundLikelihoodPerTick: 0.0125,
    maxLookDist: 8,
    interactionRange: 8,
    speedWhenIdling: 0.6,
    homeCloseEnoughDistance: 2,
    homeTooFarDistance: 100,
    homeStrollAroundDistance: 5,
    activityBasePriority: 10
} as const;

/**
 * Java's `PiglinBruteAi.findPiglinBruteAttackTarget`.
 *
 * Shorter than the piglin's: the grudge, then any attackable player, then the nemesis. A brute has
 * no gold-armor exemption, which is why gold does not protect a player inside a bastion's throne
 * room.
 */
export function findPiglinBruteAttackTarget(context: BrainContext): BrainEntity | undefined {
    const brain = context.body.brain;
    const angryAtId = brain.getMemory(MemoryModuleTypes.ANGRY_AT);
    const angryAt = (brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? []).find(
        (entity) => entity.id === angryAtId && context.world.isAttackable(context.body, entity)
    );
    if (angryAt !== undefined) {
        return angryAt;
    }
    return (
        brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER) ??
        brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS)
    );
}

/** Java's `PiglinBruteAi.setPiglinBruteAngerTarget`: a 600-tick grudge, as the piglin's is. */
export function setPiglinBruteAngerTarget(context: BrainContext, target: BrainEntity): void {
    context.body.brain.eraseMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE);
    context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.ANGRY_AT, target.id, PIGLIN_BRUTE.angerDuration);
}

/** Java's `StopBeingAngryIfTargetDead`, shared with the piglin. */
function stopBeingAngryIfTargetDead(): BehaviorControl {
    return behavior('StopBeingAngryIfTargetDead')
        .present(MemoryModuleTypes.ANGRY_AT)
        .build((context, angryAt) => {
            const id = angryAt.get();
            const alive = (context.body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? []).some(
                (entity) => entity.id === id && entity.alive
            );
            if (alive) {
                return false;
            }
            angryAt.erase();
            return true;
        });
}

/** Java's `PiglinBruteAi.createIdleLookBehaviors`, which adds the brute to the piglin's list. */
function idleLookBehaviors(): RunOne {
    return new RunOne([
        [setEntityLookTarget(ofType('minecraft:player'), PIGLIN_BRUTE.maxLookDist), 1],
        [setEntityLookTarget(ofType('minecraft:piglin'), PIGLIN_BRUTE.maxLookDist), 1],
        [setEntityLookTarget(ofType('minecraft:piglin_brute'), PIGLIN_BRUTE.maxLookDist), 1],
        [setEntityLookTarget(() => true, PIGLIN_BRUTE.maxLookDist), 1],
        [new DoNothing(30, 60), 1]
    ]);
}

/** Java's `PiglinBruteAi.createIdleMovementBehaviors`, the two strolls that keep it near home. */
function idleMovementBehaviors(): RunOne {
    return new RunOne([
        [randomStroll(PIGLIN_BRUTE.speedWhenIdling), 2],
        [
            interactWith(
                'minecraft:piglin',
                PIGLIN_BRUTE.interactionRange,
                MemoryModuleTypes.INTERACTION_TARGET,
                PIGLIN_BRUTE.speedWhenIdling,
                2
            ),
            2
        ],
        [
            interactWith(
                'minecraft:piglin_brute',
                PIGLIN_BRUTE.interactionRange,
                MemoryModuleTypes.INTERACTION_TARGET,
                PIGLIN_BRUTE.speedWhenIdling,
                2
            ),
            2
        ],
        [
            strollToPoi(
                MemoryModuleTypes.HOME,
                PIGLIN_BRUTE.speedWhenIdling,
                PIGLIN_BRUTE.homeCloseEnoughDistance,
                PIGLIN_BRUTE.homeTooFarDistance
            ),
            2
        ],
        [
            strollAroundPoi(
                MemoryModuleTypes.HOME,
                PIGLIN_BRUTE.speedWhenIdling,
                PIGLIN_BRUTE.homeStrollAroundDistance
            ),
            2
        ],
        [new DoNothing(30, 60), 1]
    ]);
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [lookAtTargetSink(45, 90), moveToTargetSink(), interactWithDoor(), stopBeingAngryIfTargetDead()])
    );
}

function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        prioritized(PIGLIN_BRUTE.activityBasePriority, [
            startAttacking(findPiglinBruteAttackTarget),
            idleLookBehaviors(),
            idleMovementBehaviors(),
            setLookAndInteract('minecraft:player', 4)
        ])
    );
}

function fightActivity(): ActivityData {
    return activityData(
        Activities.FIGHT,
        prioritized(PIGLIN_BRUTE.activityBasePriority, [
            stopAttackingIfTargetInvalid({
                stopAttackingWhen: (context, target) => findPiglinBruteAttackTarget(context) !== target
            }),
            setWalkTargetFromAttackTargetIfTargetOutOfReach(1),
            meleeAttack(PIGLIN_BRUTE.meleeAttackCooldown)
        ]),
        { gatedBy: MemoryModuleTypes.ATTACK_TARGET }
    );
}

export function piglinBruteActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), fightActivity()];
}

export const PIGLIN_BRUTE_BRAIN: BrainMobDefinition = {
    id: 'minecraft:piglin_brute',
    memories: [MemoryModuleTypes.NEAREST_VISIBLE_ADULT_PIGLINS],
    sensorTypes: [
        'nearest_living_entities',
        'nearest_players',
        'nearest_items',
        'hurt_by',
        'piglin_brute_specific_sensor'
    ],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            memories: PIGLIN_BRUTE_BRAIN.memories,
            sensors: [
                new NearestLivingEntitySensor(),
                new PlayerSensor(),
                new NearestItemSensor(),
                new HurtBySensor(),
                new PiglinBruteSpecificSensor()
            ],
            activities: piglinBruteActivities()
        }),
    /** Java's `PiglinBruteAi.initMemories`: home is wherever the brute was placed. */
    initMemories: (context) =>
        context.body.brain.setMemory(MemoryModuleTypes.HOME, {
            dimension: context.world.dimension,
            pos: blockContaining(context.body.position)
        }),
    updateActivity: (context) => {
        const brain = context.body.brain;
        brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.IDLE]);
        context.body.setCondition('aggressive', brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET));
    }
};
