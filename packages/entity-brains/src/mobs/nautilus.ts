/**
 * The nautilus's brain, and the zombie nautilus's. Transcribed from `NautilusAi` and
 * `ZombieNautilusAi` in the 26.3 server jar.
 *
 * The two share `findNautilusAttackTarget` and their fight activity differs only in the dash
 * speed and the sound, so both live here; they are separate registry entries.
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
    isBreeding,
    lookAtTargetSink,
    moveToTargetSink,
    randomStroll,
    sample,
    setWalkTargetFromLookTarget,
    startAttacking,
    uniformInt
} from '../behavior/common.js';
import type { BehaviorControl, BehaviorHooks } from '../behavior/control.js';
import { Behavior, conditions } from '../behavior/control.js';
import { GateBehavior } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import {
    AdultSensor,
    HurtBySensor,
    NearestLivingEntitySensor,
    PlayerSensor,
    TemptingSensor
} from '../sensing/sensors.js';
import type { BrainContext, BrainEntity } from '../world.js';
import { blockContaining, blockPosTracker, EntityCondition } from '../world.js';

/** The named constants of `NautilusAi`. */
export const NAUTILUS = {
    speedWhenIdlingInWater: 1,
    speedWhenTempted: 1.3,
    speedWhenMakingLove: 0.4,
    speedWhenPanicking: 1.6,
    timeBetweenNonPlayerAttacks: uniformInt(2400, 3600),
    speedWhenAttacking: 0.6,
    attackKnockbackForce: 2,
    angerDuration: 400,
    timeBetweenAttacks: 80,
    maxChargeDistance: 12,
    maxTargetDetectionDistance: 11,
    /** The chance a nautilus declines to pick a non-player target when its cooldown expires. */
    declineTargetChance: 0.5,
    temptationTag: 'minecraft:nautilus_food',
    hostilesTag: 'minecraft:nautilus_hostiles'
} as const;

/** The named constants of `ZombieNautilusAi`, which overrides four of the nautilus's. */
export const ZOMBIE_NAUTILUS = {
    speedWhenIdlingInWater: 1,
    speedWhenTempted: 0.9,
    speedWhenAttacking: 0.5,
    attackKnockbackForce: 2,
    timeBetweenAttacks: 80,
    maxChargeDistance: 12,
    maxTargetDetectionDistance: 11
} as const;

/**
 * Java's `NautilusAi.findNautilusAttackTarget`, shared by both nautilus kinds.
 *
 * The order matters and is worth stating: an `ANGRY_AT` target in water wins outright; otherwise,
 * while `ATTACK_TARGET_COOLDOWN` holds, nothing is chosen; and when the cooldown expires the
 * nautilus redraws it and declines half the time, so an unprovoked nautilus attacks rarely.
 */
export function findNautilusAttackTarget(context: BrainContext): BrainEntity | undefined {
    const body = context.body;
    if (isBreeding(body) || !has(body, EntityCondition.IN_WATER) || body.baby || has(body, EntityCondition.TAME)) {
        return undefined;
    }
    const angryAtId = body.brain.getMemory(MemoryModuleTypes.ANGRY_AT);
    const nearby = body.brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? [];
    const angryAt = nearby.find(
        (entity) =>
            entity.id === angryAtId &&
            entity.conditions.has(EntityCondition.IN_WATER) &&
            context.world.isAttackable(body, entity)
    );
    if (angryAt !== undefined) {
        return angryAt;
    }
    if (body.brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET_COOLDOWN)) {
        return undefined;
    }
    body.brain.setMemory(
        MemoryModuleTypes.ATTACK_TARGET_COOLDOWN,
        sample(NAUTILUS.timeBetweenNonPlayerAttacks, (bound) => context.world.randomInt(bound))
    );
    if (context.world.random() < NAUTILUS.declineTargetChance) {
        return undefined;
    }
    return body.brain
        .getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
        ?.findClosest(
            (entity) => entity.conditions.has(EntityCondition.IN_WATER) && entity.typeTags.has(NAUTILUS.hostilesTag)
        );
}

/** Java's `NautilusAi.setNautilusAngerTarget`: a 400-tick grudge keyed by the attacker's identity. */
export function setNautilusAngerTarget(context: BrainContext, target: BrainEntity): void {
    if (!context.world.isAttackable(context.body, target)) {
        return;
    }
    context.body.brain.eraseMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE);
    context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.ANGRY_AT, target.id, NAUTILUS.angerDuration);
}

/**
 * Java's `ChargeAttack`: swim hard at the attack target, hit it once, and go on cooldown.
 *
 * The three distances are the Java arguments: the charge runs for at most `maxChargeDistance`, it
 * only starts within `maxTargetDetectionDistance`, and `CHARGE_COOLDOWN_TICKS` gates the next one.
 */
function chargeAttack(
    cooldown: number,
    speed: number,
    maxChargeDistance: number,
    maxTargetDetectionDistance: number,
    sound: string
): BehaviorControl {
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET);
            if (target === undefined) {
                return false;
            }
            const distance = Math.hypot(
                target.position.x - context.body.position.x,
                target.position.y - context.body.position.y,
                target.position.z - context.body.position.z
            );
            return distance <= maxTargetDetectionDistance;
        },
        canStillUse: (context) => context.body.brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET),
        start: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET);
            if (target === undefined) {
                return;
            }
            context.body.playSound(sound);
            context.body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                target: blockPosTracker(blockContaining(target.position)),
                speedModifier: speed,
                closeEnoughDist: 0
            });
        },
        tick: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET);
            if (target !== undefined && context.world.isWithinMeleeRange(context.body, target)) {
                context.body.attack(target);
                context.body.brain.setMemory(MemoryModuleTypes.CHARGE_COOLDOWN_TICKS, cooldown);
            }
        },
        stop: (context) => context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET)
    };
    void maxChargeDistance;
    return new Behavior('ChargeAttack', conditions([MemoryModuleTypes.ATTACK_TARGET, 'value_present']), hooks, {
        minDuration: cooldown,
        maxDuration: cooldown
    });
}

function nautilusCoreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            animalPanic(NAUTILUS.speedWhenPanicking),
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.CHARGE_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.ATTACK_TARGET_COOLDOWN)
        ])
    );
}

function swimWander(speed: number): GateBehavior {
    return new GateBehavior(
        'ordered',
        'try_all',
        [
            [randomStroll(speed, 'water'), 2],
            [setWalkTargetFromLookTarget(speed, 3), 3]
        ],
        { entryCondition: conditions([MemoryModuleTypes.WALK_TARGET, 'value_absent']) }
    );
}

function nautilusIdleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [1, animalMakeLove('minecraft:nautilus', NAUTILUS.speedWhenMakingLove, 2)],
        [
            2,
            followTemptation(
                () => NAUTILUS.speedWhenTempted,
                (body) => (body.baby ? 2.5 : 3.5)
            )
        ],
        [3, startAttacking(findNautilusAttackTarget)],
        [4, swimWander(NAUTILUS.speedWhenIdlingInWater)]
    ]);
}

function fightActivity(speed: number, sound: string): ActivityData {
    return activityData(
        Activities.FIGHT,
        [
            [
                0,
                chargeAttack(
                    NAUTILUS.timeBetweenAttacks,
                    speed,
                    NAUTILUS.maxChargeDistance,
                    NAUTILUS.maxTargetDetectionDistance,
                    sound
                )
            ]
        ],
        {
            conditions: [
                [MemoryModuleTypes.ATTACK_TARGET, 'value_present'],
                [MemoryModuleTypes.TEMPTING_PLAYER, 'value_absent'],
                [MemoryModuleTypes.BREED_TARGET, 'value_absent'],
                [MemoryModuleTypes.CHARGE_COOLDOWN_TICKS, 'value_absent']
            ]
        }
    );
}

export function nautilusActivities(): readonly ActivityData[] {
    return [
        nautilusCoreActivity(),
        nautilusIdleActivity(),
        fightActivity(NAUTILUS.speedWhenAttacking, 'minecraft:entity.nautilus.dash')
    ];
}

const nautilusSensors = () => [
    new NearestLivingEntitySensor(),
    new AdultSensor(),
    new PlayerSensor(),
    new HurtBySensor(),
    TemptingSensor.forTag(NAUTILUS.temptationTag)
];

export const NAUTILUS_BRAIN: BrainMobDefinition = {
    id: 'minecraft:nautilus',
    memories: [MemoryModuleTypes.ANGRY_AT, MemoryModuleTypes.ATTACK_TARGET_COOLDOWN],
    sensorTypes: ['nearest_living_entities', 'nearest_adult', 'nearest_players', 'hurt_by', 'nautilus_temptations'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            memories: NAUTILUS_BRAIN.memories,
            sensors: nautilusSensors(),
            activities: nautilusActivities()
        }),
    /** Java's `NautilusAi.initMemories`: a fresh nautilus waits out a full attack cooldown. */
    initMemories: (context) =>
        context.body.brain.setMemory(
            MemoryModuleTypes.ATTACK_TARGET_COOLDOWN,
            sample(NAUTILUS.timeBetweenNonPlayerAttacks, (bound) => context.world.randomInt(bound))
        ),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.IDLE])
};

function zombieNautilusCoreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.CHARGE_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.ATTACK_TARGET_COOLDOWN)
        ])
    );
}

/** The zombie nautilus has no `AnimalPanic` and no `AnimalMakeLove`; it is otherwise the same. */
function zombieNautilusIdleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [
            1,
            followTemptation(
                () => ZOMBIE_NAUTILUS.speedWhenTempted,
                (body) => (body.baby ? 2.5 : 3.5)
            )
        ],
        [2, startAttacking(findNautilusAttackTarget)],
        [3, swimWander(ZOMBIE_NAUTILUS.speedWhenIdlingInWater)]
    ]);
}

export function zombieNautilusActivities(): readonly ActivityData[] {
    return [
        zombieNautilusCoreActivity(),
        zombieNautilusIdleActivity(),
        fightActivity(ZOMBIE_NAUTILUS.speedWhenAttacking, 'minecraft:entity.zombie_nautilus.dash')
    ];
}

export const ZOMBIE_NAUTILUS_BRAIN: BrainMobDefinition = {
    id: 'minecraft:zombie_nautilus',
    memories: [MemoryModuleTypes.ANGRY_AT, MemoryModuleTypes.ATTACK_TARGET_COOLDOWN],
    sensorTypes: ['nearest_living_entities', 'nearest_adult', 'nearest_players', 'hurt_by', 'nautilus_temptations'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            memories: ZOMBIE_NAUTILUS_BRAIN.memories,
            sensors: nautilusSensors(),
            activities: zombieNautilusActivities()
        }),
    initMemories: (context) =>
        context.body.brain.setMemory(
            MemoryModuleTypes.ATTACK_TARGET_COOLDOWN,
            sample(NAUTILUS.timeBetweenNonPlayerAttacks, (bound) => context.world.randomInt(bound))
        ),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.FIGHT, Activities.IDLE])
};
