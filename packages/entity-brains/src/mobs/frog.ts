/**
 * The frog's brain. Transcribed from `FrogAi` in the 26.3 server jar.
 *
 * The frog has six activities, the most of any mob but the warden and the villager, and it is the
 * clearest case for why Bedrock's JSON cannot express a brain: `idle`, `swim` and `lay_spawn` are
 * three variants of the same wandering, told apart only by `IS_IN_WATER`, `IS_PREGNANT` and
 * `LONG_JUMP_MID_JUMP`, which are memories with no Bedrock equivalent.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { behavior, countDownCooldownTicks, triggerIf } from '../behavior/builder.js';
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
    setEntityLookTargetSometimes,
    setWalkTargetFromLookTarget,
    startAttacking,
    stopAttackingIfTargetInvalid,
    timedState,
    uniformInt
} from '../behavior/common.js';
import type { BehaviorControl } from '../behavior/control.js';
import { conditions } from '../behavior/control.js';
import { GateBehavior, RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import {
    FrogAttackablesSensor,
    HurtBySensor,
    IsInWaterSensor,
    NearestLivingEntitySensor,
    TemptingSensor
} from '../sensing/sensors.js';
import type { BrainContext } from '../world.js';
import { blockContaining, blockPosTracker, EntityCondition } from '../world.js';

/** The named constants of `FrogAi`. */
export const FROG = {
    speedWhenPanicking: 2,
    speedWhenIdling: 1,
    speedOnLand: 1,
    speedInWater: 0.75,
    timeBetweenLongJumps: uniformInt(100, 140),
    maxLongJumpHeight: 2,
    maxLongJumpWidth: 4,
    maxJumpVelocityMultiplier: 3.5714288,
    speedWhenTempted: 1.25,
    /** `FrogAi.getTemptations()` is `#minecraft:frog_food`. */
    temptationTag: 'minecraft:frog_food',
    preferJumpToTag: 'minecraft:frog_prefer_jump_to',
    /** The `LongJumpToPreferredBlock` bias towards a preferred landing block. */
    preferredBlockChance: 0.5,
    /** `TryFindLand.create(6, 1.0F)` in idle and `TryFindLand.create(8, 1.5F)` in swim. */
    findLandIdle: { range: 6, speed: 1 },
    findLandSwim: { range: 8, speed: 1.5 },
    findLandNearLiquid: { range: 8, speed: 1 },
    frogspawn: 'minecraft:frogspawn'
} as const;

const canAttack = (context: BrainContext): boolean => !isBreeding(context.body);

const nearestAttackable = (context: BrainContext) => context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE);

/** Java's `TryFindLand`: walk to a dry block within range. */
function tryFindLand(range: number, speedModifier: number): BehaviorControl {
    return triggerIf('TryFindLand', (body, context) => {
        const land = context.world.findBlock(
            blockContaining(body.position),
            range,
            range,
            (block) => block === 'minecraft:air'
        );
        if (land === undefined) {
            return false;
        }
        body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
            target: blockPosTracker(land),
            speedModifier,
            closeEnoughDist: 0
        });
        return true;
    });
}

/** Java's `Croak`: a short idle noise, in the frog's idle and lay-spawn wander lists. */
function croak(): BehaviorControl {
    return timedState('Croak', 60, { startSound: 'minecraft:entity.frog.croak' });
}

/**
 * Java's `TryLaySpawnOnFluidNearLand`: places frogspawn and clears `IS_PREGNANT`.
 *
 * The frog must be out of the water and on the ground, and it looks only at the four blocks
 * horizontally adjacent to the one below it. The block placement is the host's; what the brain
 * owns is the end of the pregnancy.
 */
function tryLaySpawn(): BehaviorControl {
    return behavior('TryLaySpawnOnFluidNearLand')
        .absent(MemoryModuleTypes.ATTACK_TARGET)
        .present(MemoryModuleTypes.WALK_TARGET)
        .present(MemoryModuleTypes.IS_PREGNANT)
        .build((context, _attackTarget, _walkTarget, pregnant) => {
            if (has(context.body, EntityCondition.IN_WATER) || !has(context.body, EntityCondition.ON_GROUND)) {
                return false;
            }
            const water = context.world.findBlock(
                blockContaining(context.body.position),
                1,
                1,
                (block) => block === 'minecraft:water'
            );
            if (water === undefined) {
                return true;
            }
            context.world.emitGameEvent('minecraft:block_place', context.body.position, context.body);
            context.body.playSound('minecraft:entity.frog.lay_spawn');
            pregnant.erase();
            return true;
        });
}

/**
 * Java's `LongJumpMidJump` and `LongJumpToPreferredBlock`, folded into the memory state machine
 * they share.
 *
 * `LONG_JUMP_MID_JUMP` marks the airborne frame, which is why `idle`, `swim` and `lay_spawn` all
 * require it absent, and the landing redraws `LONG_JUMP_COOLDOWN_TICKS` from `(100, 140)`.
 */
function longJump(interval: typeof FROG.timeBetweenLongJumps, sound: string): BehaviorControl {
    return timedState('LongJumpToPreferredBlock', 20, {
        entryCondition: conditions(
            [MemoryModuleTypes.LOOK_TARGET, 'registered'],
            [MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS, 'value_absent'],
            [MemoryModuleTypes.LONG_JUMP_MID_JUMP, 'value_absent']
        ),
        onStart: (context) => {
            context.body.brain.setMemory(MemoryModuleTypes.LONG_JUMP_MID_JUMP, true);
            context.body.jump();
            context.body.playSound(sound);
        },
        onStop: (context) => {
            context.body.brain.eraseMemory(MemoryModuleTypes.LONG_JUMP_MID_JUMP);
            context.body.brain.setMemory(
                MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS,
                sample(interval, (bound) => context.world.randomInt(bound))
            );
        }
    });
}

/**
 * Java's `ShootTongue`: eats the attack target.
 *
 * A target the frog cannot reach goes on `UNREACHABLE_TONGUE_TARGETS`, which is what stops a frog
 * from fixating on a slime behind glass; {@link FrogAttackablesSensor} reads that list back.
 */
function shootTongue(): BehaviorControl {
    return timedState('ShootTongue', 20, {
        entryCondition: conditions([MemoryModuleTypes.ATTACK_TARGET, 'value_present']),
        startSound: 'minecraft:entity.frog.tongue',
        onStop: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET);
            if (target === undefined) {
                return;
            }
            if (context.world.isWithinMeleeRange(context.body, target)) {
                context.body.attack(target);
                context.body.playSound('minecraft:entity.frog.eat');
            } else {
                const unreachable = context.body.brain.getMemory(MemoryModuleTypes.UNREACHABLE_TONGUE_TARGETS) ?? [];
                context.body.brain.setMemory(MemoryModuleTypes.UNREACHABLE_TONGUE_TARGETS, [...unreachable, target.id]);
            }
            context.body.brain.eraseMemory(MemoryModuleTypes.ATTACK_TARGET);
        }
    });
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            animalPanic(FROG.speedWhenPanicking),
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS)
        ])
    );
}

function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        [
            [0, setEntityLookTargetSometimes(6, uniformInt(30, 60), (entity) => entity.type === 'minecraft:player')],
            [0, animalMakeLove('minecraft:frog')],
            [1, followTemptation(() => FROG.speedWhenTempted)],
            [2, startAttacking(nearestAttackable, canAttack)],
            [3, tryFindLand(FROG.findLandIdle.range, FROG.findLandIdle.speed)],
            [
                4,
                new RunOne(
                    [
                        [randomStroll(FROG.speedWhenIdling), 1],
                        [setWalkTargetFromLookTarget(FROG.speedWhenIdling, 3), 1],
                        [croak(), 3],
                        [triggerIf('OnGround', (body) => has(body, EntityCondition.ON_GROUND)), 2]
                    ],
                    conditions([MemoryModuleTypes.WALK_TARGET, 'value_absent'])
                )
            ]
        ],
        {
            conditions: [
                [MemoryModuleTypes.LONG_JUMP_MID_JUMP, 'value_absent'],
                [MemoryModuleTypes.IS_IN_WATER, 'value_absent']
            ]
        }
    );
}

function swimActivity(): ActivityData {
    return activityData(
        Activities.SWIM,
        [
            [0, setEntityLookTargetSometimes(6, uniformInt(30, 60), (entity) => entity.type === 'minecraft:player')],
            [1, followTemptation(() => FROG.speedWhenTempted)],
            [2, startAttacking(nearestAttackable, canAttack)],
            [3, tryFindLand(FROG.findLandSwim.range, FROG.findLandSwim.speed)],
            [
                5,
                new GateBehavior(
                    'ordered',
                    'try_all',
                    [
                        [randomStroll(FROG.speedInWater, 'water'), 1],
                        [randomStroll(FROG.speedOnLand, 'land', undefined, true), 1],
                        [setWalkTargetFromLookTarget(FROG.speedOnLand, 3), 1],
                        [triggerIf('IsInWater', (body) => has(body, EntityCondition.IN_WATER)), 5]
                    ],
                    { entryCondition: conditions([MemoryModuleTypes.WALK_TARGET, 'value_absent']) }
                )
            ]
        ],
        {
            conditions: [
                [MemoryModuleTypes.LONG_JUMP_MID_JUMP, 'value_absent'],
                [MemoryModuleTypes.IS_IN_WATER, 'value_present']
            ]
        }
    );
}

function laySpawnActivity(): ActivityData {
    return activityData(
        Activities.LAY_SPAWN,
        [
            [0, setEntityLookTargetSometimes(6, uniformInt(30, 60), (entity) => entity.type === 'minecraft:player')],
            [1, startAttacking(nearestAttackable, canAttack)],
            [2, tryFindLand(FROG.findLandNearLiquid.range, FROG.findLandNearLiquid.speed)],
            [3, tryLaySpawn()],
            [
                4,
                new RunOne([
                    [randomStroll(FROG.speedWhenIdling), 2],
                    [setWalkTargetFromLookTarget(FROG.speedWhenIdling, 3), 1],
                    [croak(), 2],
                    [triggerIf('OnGround', (body) => has(body, EntityCondition.ON_GROUND)), 1]
                ])
            ]
        ],
        {
            conditions: [
                [MemoryModuleTypes.LONG_JUMP_MID_JUMP, 'value_absent'],
                [MemoryModuleTypes.IS_PREGNANT, 'value_present']
            ]
        }
    );
}

function longJumpActivity(): ActivityData {
    return activityData(
        Activities.LONG_JUMP,
        [[0, longJump(FROG.timeBetweenLongJumps, 'minecraft:entity.frog.long_jump')]],
        {
            conditions: [
                [MemoryModuleTypes.TEMPTING_PLAYER, 'value_absent'],
                [MemoryModuleTypes.BREED_TARGET, 'value_absent'],
                [MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS, 'value_absent'],
                [MemoryModuleTypes.IS_IN_WATER, 'value_absent']
            ]
        }
    );
}

function tongueActivity(): ActivityData {
    return activityData(Activities.TONGUE, prioritized(0, [stopAttackingIfTargetInvalid(), shootTongue()]), {
        gatedBy: MemoryModuleTypes.ATTACK_TARGET
    });
}

/** The frog's six activities: the core package, `idle`, `swim`, `lay_spawn`, `tongue` and `long_jump`. */
export function frogActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), swimActivity(), laySpawnActivity(), tongueActivity(), longJumpActivity()];
}

/**
 * The frog's registry entry. `initMemories` starts the long-jump cooldown at a full interval, so a
 * freshly spawned frog does not jump on its first tick.
 */
export const FROG_BRAIN: BrainMobDefinition = {
    id: 'minecraft:frog',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'hurt_by', 'frog_attackables', 'frog_temptations', 'is_in_water'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new HurtBySensor(),
                new FrogAttackablesSensor(),
                TemptingSensor.forTag(FROG.temptationTag),
                new IsInWaterSensor()
            ],
            activities: frogActivities()
        }),
    /** Java's `FrogAi.initMemories`: the first long jump is one full interval away. */
    initMemories: (context) =>
        context.body.brain.setMemory(
            MemoryModuleTypes.LONG_JUMP_COOLDOWN_TICKS,
            sample(FROG.timeBetweenLongJumps, (bound) => context.world.randomInt(bound))
        ),
    updateActivity: (context) =>
        context.body.brain.setActiveActivityToFirstValid([
            Activities.TONGUE,
            Activities.LAY_SPAWN,
            Activities.LONG_JUMP,
            Activities.SWIM,
            Activities.IDLE
        ])
};
