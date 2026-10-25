/** The axolotl's brain. Transcribed from `AxolotlAi` in the 26.3 server jar. */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { countDownCooldownTicks, triggerIf } from '../behavior/builder.js';
import {
    animalMakeLove,
    babyFollowAdult,
    eraseMemoryIf,
    followTemptation,
    has,
    isBreeding,
    lookAtTargetSink,
    meleeAttack,
    moveToTargetSink,
    randomStroll,
    setEntityLookTargetSometimes,
    setWalkTargetFromAttackTargetIfTargetOutOfReach,
    setWalkTargetFromLookTarget,
    startAttacking,
    stopAttackingIfTargetInvalid,
    timedState,
    uniformInt
} from '../behavior/common.js';
import { conditions } from '../behavior/control.js';
import { GateBehavior } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import {
    AdultSensor,
    AxolotlAttackablesSensor,
    HurtBySensor,
    NearestLivingEntitySensor,
    TemptingSensor
} from '../sensing/sensors.js';
import type { BrainContext, BrainMob } from '../world.js';
import { blockContaining, blockPosTracker, EntityCondition } from '../world.js';

/** The named constants of `AxolotlAi`. */
export const AXOLOTL = {
    adultFollowRange: uniformInt(5, 16),
    speedWhenMakingLove: 0.2,
    speedOnLand: 0.15,
    speedWhenIdlingInWater: 0.5,
    speedWhenChasingInWater: 0.6,
    speedWhenFollowingAdultInWater: 0.6,
    meleeAttackCooldown: 20,
    /** `AxolotlAi.updateActivity` sets this after a fight ends. */
    huntingCooldown: 2400,
    /** `Axolotl.PLAY_DEAD_TICKS` is set by the host when the axolotl is hurt in water. */
    playDeadTicks: 200
} as const;

const inWater = (body: { conditions: ReadonlySet<string> }): boolean => body.conditions.has(EntityCondition.IN_WATER);

/** Java's `AxolotlAi.getSpeedModifier`, and the two variants that only differ in the water value. */
export function axolotlSpeed(body: { conditions: ReadonlySet<string> }, inWaterSpeed: number): number {
    return inWater(body) ? inWaterSpeed : AXOLOTL.speedOnLand;
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            // Java's `ValidatePlayDead`: erases PLAY_DEAD_TICKS once the axolotl leaves the water.
            eraseMemoryIf((body) => !inWater(body), MemoryModuleTypes.PLAY_DEAD_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS)
        ])
    );
}

function idleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [0, setEntityLookTargetSometimes(6, uniformInt(30, 60), (entity) => entity.type === 'minecraft:player')],
        [1, animalMakeLove('minecraft:axolotl', AXOLOTL.speedWhenMakingLove, 2)],
        [
            2,
            new GateBehavior('shuffled', 'run_one', [
                [followTemptation((body) => axolotlSpeed(body, AXOLOTL.speedWhenIdlingInWater)), 1],
                [
                    babyFollowAdult(AXOLOTL.adultFollowRange, (body) =>
                        axolotlSpeed(body, AXOLOTL.speedWhenFollowingAdultInWater)
                    ),
                    1
                ]
            ])
        ],
        [
            3,
            startAttacking((context) =>
                isBreeding(context.body)
                    ? undefined
                    : context.body.brain.getMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)
            )
        ],
        // Java's `TryFindLiquid.create(6, 0.15F, FluidTags.AXOLOTL_TRIES_TO_FIND)`.
        [3, tryFindWater()],
        [
            4,
            new GateBehavior(
                'ordered',
                'try_all',
                [
                    [randomStroll(AXOLOTL.speedWhenIdlingInWater, 'water'), 2],
                    [randomStroll(AXOLOTL.speedOnLand, 'land', undefined, false), 2],
                    [
                        setWalkTargetFromLookTarget(
                            (body) => axolotlSpeed(body, AXOLOTL.speedWhenIdlingInWater),
                            3,
                            canSetWalkTargetFromLookTarget
                        ),
                        3
                    ],
                    [triggerIf('IsInWater', (body) => inWater(body)), 5],
                    [triggerIf('OnGround', (body) => has(body, EntityCondition.ON_GROUND)), 5]
                ],
                { entryCondition: conditions([MemoryModuleTypes.WALK_TARGET, 'value_absent']) }
            )
        ]
    ]);
}

/**
 * Java's `AxolotlAi.canSetWalkTargetFromLookTarget`: only walk towards a look target that is in
 * the same medium the axolotl is already in, so it does not beach itself chasing something.
 */
function canSetWalkTargetFromLookTarget(body: BrainMob, context: BrainContext): boolean {
    const lookTarget = body.brain.getMemory(MemoryModuleTypes.LOOK_TARGET);
    if (lookTarget === undefined) {
        return false;
    }
    const wateryTarget = context.world.blockAt(lookTarget.currentBlockPosition()) === 'minecraft:water';
    return wateryTarget === inWater(body);
}

/** Java's `TryFindLiquid`: walks to the nearest water within six blocks when out of it. */
function tryFindWater() {
    return triggerIf('TryFindLiquid', (body, context) => {
        if (inWater(body)) {
            return false;
        }
        const water = context.world.findBlock(
            blockContaining(body.position),
            6,
            6,
            (block) => block === 'minecraft:water'
        );
        if (water === undefined) {
            return false;
        }
        body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
            target: blockPosTracker(water),
            speedModifier: AXOLOTL.speedOnLand,
            closeEnoughDist: 0
        });
        return true;
    });
}

function fightActivity(): ActivityData {
    return activityData(
        Activities.FIGHT,
        prioritized(0, [
            stopAttackingIfTargetInvalid({
                onTargetErased: (context) => context.body.brain.eraseMemory(MemoryModuleTypes.NEAREST_ATTACKABLE)
            }),
            setWalkTargetFromAttackTargetIfTargetOutOfReach((body) =>
                axolotlSpeed(body, AXOLOTL.speedWhenChasingInWater)
            ),
            meleeAttack(AXOLOTL.meleeAttackCooldown),
            eraseMemoryIf(isBreeding, MemoryModuleTypes.ATTACK_TARGET)
        ]),
        { gatedBy: MemoryModuleTypes.ATTACK_TARGET }
    );
}

/**
 * Java's `initPlayDeadActivity`.
 *
 * `PLAY_DEAD_TICKS` is both the gate and the memory erased when the activity stops, which is the
 * `ActivityData.create(activity, priority, list, memory)` shorthand.
 */
function playDeadActivity(): ActivityData {
    return activityData(
        Activities.PLAY_DEAD,
        [
            [0, timedState('PlayDead', AXOLOTL.playDeadTicks, { eraseOnStop: [MemoryModuleTypes.PLAY_DEAD_TICKS] })],
            [1, eraseMemoryIf(isBreeding, MemoryModuleTypes.PLAY_DEAD_TICKS)]
        ],
        { gatedBy: MemoryModuleTypes.PLAY_DEAD_TICKS }
    );
}

/** The axolotl's four activities: the core package, `idle`, `fight` and `play_dead`. */
export function axolotlActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity(), fightActivity(), playDeadActivity()];
}

/**
 * The axolotl's registry entry. `updateActivity` leaves an axolotl that is already playing dead
 * alone, and stamps a hunting cooldown when one drops out of `fight`.
 */
export const AXOLOTL_BRAIN: BrainMobDefinition = {
    id: 'minecraft:axolotl',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'nearest_adult', 'hurt_by', 'axolotl_attackables', 'food_temptations'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [
                new NearestLivingEntitySensor(),
                new AdultSensor(),
                new HurtBySensor(),
                new AxolotlAttackablesSensor(),
                TemptingSensor.forTag('minecraft:axolotl_food')
            ],
            activities: axolotlActivities()
        }),
    /**
     * Java's `AxolotlAi.updateActivity`, which has two twists: an axolotl already playing dead is
     * left alone entirely, and leaving `fight` stamps a 2400-tick hunting cooldown.
     */
    updateActivity: (context) => {
        const brain = context.body.brain;
        const before = brain.getActiveNonCoreActivity();
        if (before === Activities.PLAY_DEAD) {
            return;
        }
        brain.setActiveActivityToFirstValid([Activities.PLAY_DEAD, Activities.FIGHT, Activities.IDLE]);
        if (before === Activities.FIGHT && brain.getActiveNonCoreActivity() !== Activities.FIGHT) {
            brain.setMemoryWithExpiry(MemoryModuleTypes.HAS_HUNTING_COOLDOWN, true, AXOLOTL.huntingCooldown);
        }
    }
};
