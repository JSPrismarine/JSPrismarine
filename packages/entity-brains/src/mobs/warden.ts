/**
 * The warden's brain, and its anger model. Transcribed from `WardenAi`, `AngerManagement` and
 * `AngerLevel` in the 26.3 server jar.
 *
 * The warden has eight activities, the most of any mob, and six of them (`emerge`, `dig`, `roar`,
 * `investigate`, `sniff` and `fight`) are each gated on one memory. Its anger is not a memory at
 * all: {@link AngerManagement} is per-suspect state the warden carries beside its brain, and the
 * brain only sees the result through `ROAR_TARGET` and `ATTACK_TARGET`.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { behavior } from '../behavior/builder.js';
import {
    lookAtTargetSink,
    meleeAttack,
    moveToTargetSink,
    randomStroll,
    setEntityLookTarget,
    setWalkTargetFromAttackTargetIfTargetOutOfReach,
    stopAttackingIfTargetInvalid,
    swim,
    timedState
} from '../behavior/common.js';
import type { BehaviorControl } from '../behavior/control.js';
import { conditions, DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes, UNIT } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import { PlayerSensor, WardenEntitySensor } from '../sensing/sensors.js';
import type { BrainContext, BrainEntity } from '../world.js';
import { blockContaining, blockPosTracker } from '../world.js';

/**
 * The named constants of `WardenAi`.
 *
 * The four animation durations are written in Java as `Mth.ceil` of a float, because they come
 * from the animation files: `EMERGE_DURATION` is `ceil(133.59999)`, `ROAR_DURATION` is `ceil(84)`,
 * the dig is `ceil(100)` and the sniff is `ceil(83.2)`.
 */
export const WARDEN = {
    speedWhenIdling: 0.5,
    speedWhenInvestigating: 0.7,
    speedWhenFighting: 1.2,
    meleeAttackCooldown: 18,
    diggingDuration: Math.ceil(100),
    emergeDuration: Math.ceil(133.59999),
    roarDuration: Math.ceil(84),
    sniffingDuration: Math.ceil(83.2),
    diggingCooldown: 1200,
    disturbanceLocationExpiryTime: 100,
    /** `Warden.VIBRATION_COOLDOWN_TICKS`. */
    vibrationCooldownTicks: 40,
    /** `Warden.ANGERMANAGEMENT_TICK_DELAY`, how often the anger map is aged. */
    angerManagementTickDelay: 20,
    /** `Roar.TICKS_BEFORE_PLAYING_ROAR_SOUND` and `Roar.ROAR_ANGER_INCREASE`. */
    roarSoundDelay: 25,
    roarAngerIncrease: 20,
    /** `TryToSniff.SNIFF_COOLDOWN`, `UniformInt.of(100, 200)`. */
    sniffCooldown: { min: 100, max: 200 },
    /** `Sniffing.ANGER_FROM_SNIFFING_MAX_DISTANCE_XZ` and `_Y`. */
    angerFromSniffingDistance: { xz: 6, y: 20 },
    /** `SonicBoom.DISTANCE_XZ`, `DISTANCE_Y`, `COOLDOWN`, `DURATION` and `TICKS_BEFORE_PLAYING_SOUND`. */
    sonicBoom: {
        distanceXz: 15,
        distanceY: 20,
        cooldown: 40,
        duration: Math.ceil(60),
        ticksBeforePlayingSound: Math.ceil(34),
        knockbackVertical: 0.5,
        knockbackHorizontal: 2.5,
        damage: 10
    },
    /** `Warden.DEFAULT_ANGER`, the anger a plain disturbance adds. */
    defaultAnger: 35,
    /** `Warden.PROJECTILE_ANGER`, added for the shooter of an arrow that lands nearby. */
    projectileAnger: 10,
    /** `Warden.ON_HURT_ANGER_BOOST`, added on top of `ANGRY`'s minimum when the warden is hit. */
    onHurtAngerBoost: 20,
    projectileAngerDistance: 30
} as const;

/** Java's `AngerLevel`: three bands over the same integer. */
export const ANGER_LEVELS = [
    { name: 'calm', minimumAnger: 0 },
    { name: 'agitated', minimumAnger: 40 },
    { name: 'angry', minimumAnger: 80 }
] as const;

/** One of the three {@link ANGER_LEVELS} names. */
export type AngerLevelName = (typeof ANGER_LEVELS)[number]['name'];

/** Java's `AngerLevel.byAnger`: the highest band whose minimum the value reaches. */
export function angerLevelByAnger(anger: number): AngerLevelName {
    let level: AngerLevelName = 'calm';
    for (const band of ANGER_LEVELS) {
        if (anger >= band.minimumAnger) {
            level = band.name;
        }
    }
    return level;
}

/** Java's `AngerManagement.MAX_ANGER`, `CONVERSION_DELAY` and `DEFAULT_ANGER_DECREASE`. */
export const ANGER_MANAGEMENT = { maxAnger: 150, conversionDelay: 2, defaultAngerDecrease: 1 } as const;

/**
 * Java's `AngerManagement`: per-suspect anger that decays by one a tick.
 *
 * The sort is the interesting part and is reproduced exactly: a suspect the warden is already
 * `angry` at outranks one it is not, a player outranks a non-player at the same band, and only
 * then does the raw anger decide. That is why a warden chases the player who poked it rather than
 * the skeleton that shot it, even when the skeleton has more anger.
 */
export class AngerManagement {
    private readonly angerBySuspect = new Map<string, number>();
    private readonly suspects: BrainEntity[] = [];
    private highestAnger = 0;

    public constructor(private readonly canTarget: (entity: BrainEntity) => boolean) {}

    /** Ages every entry by one and drops the suspects that are gone or no longer targetable. */
    public tick(): void {
        for (const suspect of [...this.suspects]) {
            const anger = this.angerBySuspect.get(suspect.id) ?? 0;
            if (anger > 1 && this.canTarget(suspect) && suspect.alive) {
                this.angerBySuspect.set(suspect.id, anger - ANGER_MANAGEMENT.defaultAngerDecrease);
            } else {
                this.angerBySuspect.delete(suspect.id);
                this.suspects.splice(this.suspects.indexOf(suspect), 1);
            }
        }
        this.sortAndUpdateHighestAnger();
    }

    /** Adds anger, clamped to 150, and returns the suspect's new total. */
    public increaseAnger(entity: BrainEntity, increment: number): number {
        const existing = this.angerBySuspect.get(entity.id);
        const anger = Math.min(ANGER_MANAGEMENT.maxAnger, (existing ?? 0) + increment);
        this.angerBySuspect.set(entity.id, anger);
        if (existing === undefined) {
            this.suspects.push(entity);
        }
        this.sortAndUpdateHighestAnger();
        return anger;
    }

    public clearAnger(entity: BrainEntity): void {
        this.angerBySuspect.delete(entity.id);
        const index = this.suspects.indexOf(entity);
        if (index >= 0) {
            this.suspects.splice(index, 1);
        }
        this.sortAndUpdateHighestAnger();
    }

    /**
     * Java's `getActiveAnger`: the anger at the current target, or the highest anger overall when
     * there is no target.
     */
    public getActiveAnger(currentTarget?: BrainEntity): number {
        return currentTarget === undefined ? this.highestAnger : (this.angerBySuspect.get(currentTarget.id) ?? 0);
    }

    /** The top suspect the warden can still target. */
    public getActiveEntity(): BrainEntity | undefined {
        return this.suspects.find((suspect) => this.canTarget(suspect));
    }

    public get angerLevel(): AngerLevelName {
        return angerLevelByAnger(this.highestAnger);
    }

    private sortAndUpdateHighestAnger(): void {
        this.highestAnger = 0;
        this.suspects.sort((a, b) => {
            const angerA = this.angerBySuspect.get(a.id) ?? 0;
            const angerB = this.angerBySuspect.get(b.id) ?? 0;
            this.highestAnger = Math.max(this.highestAnger, Math.max(angerA, angerB));
            const angryA = angerLevelByAnger(angerA) === 'angry';
            const angryB = angerLevelByAnger(angerB) === 'angry';
            if (angryA !== angryB) {
                return angryA ? -1 : 1;
            }
            const playerA = a.type === 'minecraft:player';
            const playerB = b.type === 'minecraft:player';
            if (playerA !== playerB) {
                return playerA ? -1 : 1;
            }
            return angerB - angerA;
        });
        if (this.suspects.length === 1) {
            this.highestAnger = this.angerBySuspect.get(this.suspects[0]!.id) ?? 0;
        }
    }
}

/**
 * Java's `WardenAi.setDisturbanceLocation`: what a heard vibration does to the brain.
 *
 * It only fires while the warden has neither an angry-at entity nor an attack target, so a warden
 * mid-fight ignores distractions, and it writes four memories with the same 100-tick expiry.
 */
export function setDisturbanceLocation(context: BrainContext, position: { x: number; y: number; z: number }): void {
    const brain = context.body.brain;
    if (brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET) || brain.hasMemoryValue(MemoryModuleTypes.ROAR_TARGET)) {
        return;
    }
    setDigCooldown(context);
    brain.setMemoryWithExpiry(MemoryModuleTypes.SNIFF_COOLDOWN, UNIT, WARDEN.disturbanceLocationExpiryTime);
    brain.setMemoryWithExpiry(
        MemoryModuleTypes.LOOK_TARGET,
        blockPosTracker(position),
        WARDEN.disturbanceLocationExpiryTime
    );
    brain.setMemoryWithExpiry(MemoryModuleTypes.DISTURBANCE_LOCATION, position, WARDEN.disturbanceLocationExpiryTime);
    brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
}

/**
 * Java's `WardenAi.setDigCooldown`, and the body of `DIG_COOLDOWN_SETTER`.
 *
 * Both check that the memory is already registered before writing it, which is the difference
 * between refreshing a cooldown and creating one.
 */
export function setDigCooldown(context: BrainContext): void {
    if (context.body.brain.hasMemoryValue(MemoryModuleTypes.DIG_COOLDOWN)) {
        context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.DIG_COOLDOWN, UNIT, WARDEN.diggingCooldown);
    }
}

/** Java's `DIG_COOLDOWN_SETTER`, the first entry of the warden's fight activity. */
function digCooldownSetter(): BehaviorControl {
    return behavior('DigCooldownSetter')
        .registered(MemoryModuleTypes.DIG_COOLDOWN)
        .build((_context, cooldown) => {
            if (cooldown.tryGet() !== undefined) {
                cooldown.setWithExpiry(UNIT, WARDEN.diggingCooldown);
            }
            return true;
        });
}

/**
 * Java's `SetWardenLookTarget`: face the roar target, or the disturbance when there is none.
 *
 * It requires `ATTACK_TARGET` absent, so a fighting warden looks through
 * {@link setEntityLookTarget} in its fight activity instead.
 */
function setWardenLookTarget(): BehaviorControl {
    return behavior('SetWardenLookTarget')
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .registered(MemoryModuleTypes.DISTURBANCE_LOCATION)
        .registered(MemoryModuleTypes.ROAR_TARGET)
        .absent(MemoryModuleTypes.ATTACK_TARGET)
        .build((_context, lookTarget, disturbance, roarTarget) => {
            const roar = roarTarget.tryGet();
            const target = roar === undefined ? disturbance.tryGet() : blockContaining(roar.position);
            if (target === undefined) {
                return false;
            }
            lookTarget.set(blockPosTracker(target));
            return true;
        });
}

/** Java's `SetRoarTarget`: promotes the angriest suspect into `ROAR_TARGET`. */
function setRoarTarget(angryAt: (context: BrainContext) => BrainEntity | undefined): BehaviorControl {
    return behavior('SetRoarTarget')
        .absent(MemoryModuleTypes.ROAR_TARGET)
        .absent(MemoryModuleTypes.ATTACK_TARGET)
        .registered(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE)
        .build((context, roarTarget, _attackTarget, cantReachSince) => {
            const target = angryAt(context);
            if (target === undefined) {
                return false;
            }
            roarTarget.set(target);
            cantReachSince.erase();
            return true;
        });
}

/**
 * Java's `TryToSniff`: starts the sniff activity.
 *
 * It needs something to sniff at (`NEAREST_ATTACKABLE` present) and nothing better to do
 * (`DISTURBANCE_LOCATION` absent, `SNIFF_COOLDOWN` clear), and it draws the next cooldown from
 * `UniformInt.of(100, 200)`.
 */
function tryToSniff(): BehaviorControl {
    return behavior('TryToSniff')
        .registered(MemoryModuleTypes.IS_SNIFFING)
        .registered(MemoryModuleTypes.WALK_TARGET)
        .absent(MemoryModuleTypes.SNIFF_COOLDOWN)
        .present(MemoryModuleTypes.NEAREST_ATTACKABLE)
        .absent(MemoryModuleTypes.DISTURBANCE_LOCATION)
        .build((context, isSniffing, walkTarget, cooldown) => {
            isSniffing.set(UNIT);
            cooldown.setWithExpiry(
                UNIT,
                WARDEN.sniffCooldown.min +
                    context.world.randomInt(WARDEN.sniffCooldown.max - WARDEN.sniffCooldown.min + 1)
            );
            walkTarget.erase();
            return true;
        });
}

/** Java's `GoToTargetLocation` for the warden's `DISTURBANCE_LOCATION`, two blocks close enough. */
function goToDisturbance(): BehaviorControl {
    return behavior('GoToTargetLocation')
        .present(MemoryModuleTypes.DISTURBANCE_LOCATION)
        .absent(MemoryModuleTypes.ATTACK_TARGET)
        .absent(MemoryModuleTypes.WALK_TARGET)
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .build((_context, location, _attackTarget, walkTarget, lookTarget) => {
            const tracker = blockPosTracker(location.get());
            lookTarget.set(tracker);
            walkTarget.set({ target: tracker, speedModifier: WARDEN.speedWhenInvestigating, closeEnoughDist: 2 });
            return true;
        });
}

/**
 * Java's `Roar`: the warden's only way into a fight.
 *
 * Roaring itself adds `ROAR_ANGER_INCREASE`, which is 20, to the target, so a warden that roars at
 * something it was merely agitated by ends up angry at it.
 */
function roar(anger?: WardenAnger): BehaviorControl {
    return timedState('Roar', WARDEN.roarDuration, {
        entryCondition: conditions(
            [MemoryModuleTypes.ROAR_TARGET, 'value_present'],
            [MemoryModuleTypes.ATTACK_TARGET, 'value_absent'],
            [MemoryModuleTypes.ROAR_SOUND_COOLDOWN, 'registered'],
            [MemoryModuleTypes.ROAR_SOUND_DELAY, 'registered']
        ),
        startSound: 'minecraft:entity.warden.roar',
        onStart: (context) => {
            context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.ROAR_SOUND_DELAY, UNIT, WARDEN.roarSoundDelay);
            context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            const target = context.body.brain.getMemory(MemoryModuleTypes.ROAR_TARGET);
            if (target !== undefined) {
                anger?.increaseAngerAt?.(context, target, WARDEN.roarAngerIncrease);
            }
        },
        onStop: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.ROAR_TARGET);
            context.body.brain.eraseMemory(MemoryModuleTypes.ROAR_TARGET);
            if (target !== undefined) {
                context.body.brain.setMemory(MemoryModuleTypes.ATTACK_TARGET, target);
            }
        }
    });
}

/**
 * Java's `SonicBoom`: the ranged attack, behind three memories.
 *
 * `SONIC_BOOM_COOLDOWN` gates it, `SONIC_BOOM_SOUND_DELAY` is the windup and
 * `SONIC_BOOM_SOUND_COOLDOWN` the tail; the damage itself is the host's.
 */
function sonicBoom(): BehaviorControl {
    return timedState('SonicBoom', WARDEN.sonicBoom.duration, {
        entryCondition: conditions(
            [MemoryModuleTypes.ATTACK_TARGET, 'value_present'],
            [MemoryModuleTypes.SONIC_BOOM_COOLDOWN, 'value_absent'],
            [MemoryModuleTypes.SONIC_BOOM_SOUND_COOLDOWN, 'registered'],
            [MemoryModuleTypes.SONIC_BOOM_SOUND_DELAY, 'registered']
        ),
        onStart: (context) => {
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.ATTACK_COOLING_DOWN,
                true,
                WARDEN.sonicBoom.duration
            );
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.SONIC_BOOM_SOUND_DELAY,
                UNIT,
                WARDEN.sonicBoom.ticksBeforePlayingSound
            );
            context.body.playSound('minecraft:entity.warden.sonic_charge');
        },
        onStop: (context) => {
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.SONIC_BOOM_COOLDOWN,
                UNIT,
                WARDEN.sonicBoom.cooldown
            );
            context.body.brain.setMemoryWithExpiry(
                MemoryModuleTypes.SONIC_BOOM_SOUND_COOLDOWN,
                UNIT,
                WARDEN.sonicBoom.duration - WARDEN.sonicBoom.ticksBeforePlayingSound
            );
            context.body.playSound('minecraft:entity.warden.sonic_boom');
        }
    });
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [swim(0.8), setWardenLookTarget(), lookAtTargetSink(45, 90), moveToTargetSink()])
    );
}

/** Java's `initEmergeActivity`: one behavior, gated on and clearing `IS_EMERGING`. */
function emergeActivity(): ActivityData {
    return activityData(
        Activities.EMERGE,
        prioritized(5, [
            timedState('Emerging', WARDEN.emergeDuration, {
                entryCondition: conditions(
                    [MemoryModuleTypes.IS_EMERGING, 'value_present'],
                    [MemoryModuleTypes.WALK_TARGET, 'value_absent'],
                    [MemoryModuleTypes.LOOK_TARGET, 'registered']
                ),
                eraseOnStop: [MemoryModuleTypes.IS_EMERGING],
                startSound: 'minecraft:entity.warden.emerge'
            })
        ]),
        { gatedBy: MemoryModuleTypes.IS_EMERGING }
    );
}

/** Java's `initDiggingActivity`: a warden with no roar target and no dig cooldown burrows away. */
function diggingActivity(): ActivityData {
    return activityData(
        Activities.DIG,
        [
            [0, timedState('ForceUnmount', 1)],
            [
                1,
                timedState('Digging', WARDEN.diggingDuration, {
                    entryCondition: conditions(
                        [MemoryModuleTypes.ATTACK_TARGET, 'value_absent'],
                        [MemoryModuleTypes.WALK_TARGET, 'value_absent']
                    ),
                    startSound: 'minecraft:entity.warden.dig',
                    onStop: (context) => setDigCooldown(context)
                })
            ]
        ],
        {
            conditions: [
                [MemoryModuleTypes.ROAR_TARGET, 'value_absent'],
                [MemoryModuleTypes.DIG_COOLDOWN, 'value_absent']
            ]
        }
    );
}

function idleActivity(angryAt: (context: BrainContext) => BrainEntity | undefined): ActivityData {
    return activityData(
        Activities.IDLE,
        prioritized(10, [
            setRoarTarget(angryAt),
            tryToSniff(),
            new RunOne(
                [
                    [randomStroll(WARDEN.speedWhenIdling), 2],
                    [new DoNothing(30, 60), 1]
                ],
                conditions([MemoryModuleTypes.IS_SNIFFING, 'value_absent'])
            )
        ])
    );
}

function investigateActivity(angryAt: (context: BrainContext) => BrainEntity | undefined): ActivityData {
    return activityData(Activities.INVESTIGATE, prioritized(5, [setRoarTarget(angryAt), goToDisturbance()]), {
        gatedBy: MemoryModuleTypes.DISTURBANCE_LOCATION
    });
}

function sniffingActivity(angryAt: (context: BrainContext) => BrainEntity | undefined): ActivityData {
    return activityData(
        Activities.SNIFF,
        prioritized(5, [
            setRoarTarget(angryAt),
            timedState('Sniffing', WARDEN.sniffingDuration, {
                entryCondition: conditions(
                    [MemoryModuleTypes.IS_SNIFFING, 'value_present'],
                    [MemoryModuleTypes.ATTACK_TARGET, 'value_absent'],
                    [MemoryModuleTypes.WALK_TARGET, 'value_absent'],
                    [MemoryModuleTypes.LOOK_TARGET, 'registered'],
                    [MemoryModuleTypes.NEAREST_ATTACKABLE, 'registered'],
                    [MemoryModuleTypes.DISTURBANCE_LOCATION, 'registered'],
                    [MemoryModuleTypes.SNIFF_COOLDOWN, 'registered']
                ),
                startSound: 'minecraft:entity.warden.sniff',
                eraseOnStop: [MemoryModuleTypes.IS_SNIFFING]
            })
        ]),
        { gatedBy: MemoryModuleTypes.IS_SNIFFING }
    );
}

function roarActivity(anger: WardenAnger): ActivityData {
    return activityData(Activities.ROAR, prioritized(10, [roar(anger)]), { gatedBy: MemoryModuleTypes.ROAR_TARGET });
}

/**
 * Java's `initFightActivity`.
 *
 * `StopAttackingIfTargetInvalid` is built with `canGrowTiredOfTryingToReachTarget` false, so a
 * warden never gives up on an unreachable target the way every other mob does after 200 ticks; it
 * only drops one when its anger falls below `angry` or the target stops being targetable.
 */
function fightActivity(
    isAngry: (context: BrainContext) => boolean,
    canTargetEntity: (context: BrainContext, entity: BrainEntity) => boolean,
    onTargetInvalid: (context: BrainContext, target: BrainEntity) => void,
    followRange: number
): ActivityData {
    return activityData(
        Activities.FIGHT,
        prioritized(10, [
            digCooldownSetter(),
            stopAttackingIfTargetInvalid({
                stopAttackingWhen: (context, target) => !isAngry(context) || !canTargetEntity(context, target),
                onTargetErased: onTargetInvalid,
                canGrowTired: false
            }),
            setEntityLookTarget(
                (entity, context) => context.body.brain.getMemory(MemoryModuleTypes.ATTACK_TARGET) === entity,
                followRange
            ),
            setWalkTargetFromAttackTargetIfTargetOutOfReach(WARDEN.speedWhenFighting),
            sonicBoom(),
            meleeAttack(WARDEN.meleeAttackCooldown)
        ]),
        { gatedBy: MemoryModuleTypes.ATTACK_TARGET }
    );
}

/** What a host must answer for a warden brain: its anger model, in the two forms the brain reads. */
export interface WardenAnger {
    /** The suspect the warden is angry at, Java's `Warden::getEntityAngryAt`. */
    entityAngryAt(context: BrainContext): BrainEntity | undefined;
    /** Java's `Warden::getAngerLevel().isAngry()`. */
    isAngry(context: BrainContext): boolean;
    /** Java's `Warden::canTargetEntity`. */
    canTargetEntity(context: BrainContext, entity: BrainEntity): boolean;
    /** Java's `Warden::clearAnger`. */
    clearAnger(context: BrainContext, entity: BrainEntity): void;
    /** Java's `Warden::increaseAngerAt`, which `Roar` calls with 20 and no sound. */
    increaseAngerAt?(context: BrainContext, entity: BrainEntity, amount: number): void;
}

/**
 * A {@link WardenAnger} over an {@link AngerManagement} the caller owns.
 *
 * `getEntityAngryAt` returns a suspect only while the warden is `angry`, which is why an agitated
 * warden listens and sniffs rather than charging.
 */
export function angerFrom(anger: AngerManagement, canTargetEntity: (entity: BrainEntity) => boolean): WardenAnger {
    return {
        entityAngryAt: () => (anger.angerLevel === 'angry' ? anger.getActiveEntity() : undefined),
        isAngry: () => anger.angerLevel === 'angry',
        canTargetEntity: (_context, entity) => canTargetEntity(entity),
        clearAnger: (_context, entity) => anger.clearAnger(entity),
        increaseAngerAt: (_context, entity, amount) => {
            anger.increaseAnger(entity, amount);
        }
    };
}

export function wardenActivities(anger: WardenAnger, followRange: number): readonly ActivityData[] {
    const angryAt = (context: BrainContext): BrainEntity | undefined => anger.entityAngryAt(context);
    return [
        coreActivity(),
        emergeActivity(),
        diggingActivity(),
        idleActivity(angryAt),
        roarActivity(anger),
        fightActivity(
            (context) => anger.isAngry(context),
            (context, entity) => anger.canTargetEntity(context, entity),
            (context, target) => {
                if (!anger.canTargetEntity(context, target)) {
                    anger.clearAnger(context, target);
                }
                setDigCooldown(context);
            },
            followRange
        ),
        investigateActivity(angryAt),
        sniffingActivity(angryAt)
    ];
}

/**
 * Java's `Warden.finalizeSpawn` branch for a warden summoned by a sculk shrieker: it poses as
 * emerging and holds `IS_EMERGING` for the emerge animation.
 */
export function startEmerging(context: BrainContext): void {
    context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.IS_EMERGING, UNIT, WARDEN.emergeDuration);
}

/** Java's `Warden.FOLLOW_RANGE`, the look range the fight activity is built with. */
export const WARDEN_FOLLOW_RANGE = 24;

/**
 * Builds a warden brain over an anger model the caller owns.
 *
 * {@link WARDEN_BRAIN}'s own `makeBrain` creates a private {@link AngerManagement} that targets
 * everything, which is enough to run the activity table; a server that wants the real anger rules
 * builds the manager itself and calls this, because the anger outlives any one brain.
 */
export function makeWardenBrain(anger: AngerManagement, canTargetEntity: (entity: BrainEntity) => boolean): Brain {
    return new Brain({
        memories: WARDEN_BRAIN.memories,
        sensors: [new PlayerSensor(), new WardenEntitySensor((_context, entity) => canTargetEntity(entity))],
        activities: wardenActivities(angerFrom(anger, canTargetEntity), WARDEN_FOLLOW_RANGE)
    });
}

export const WARDEN_BRAIN: BrainMobDefinition = {
    id: 'minecraft:warden',
    memories: [
        MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS,
        MemoryModuleTypes.RECENT_PROJECTILE,
        MemoryModuleTypes.TOUCH_COOLDOWN,
        MemoryModuleTypes.VIBRATION_COOLDOWN
    ],
    sensorTypes: ['nearest_players', 'warden_entity_sensor'],
    alsoRunsGoals: false,
    makeBrain: () => makeWardenBrain(new AngerManagement(() => true), () => true),
    /**
     * Java's `Warden.finalizeSpawn`: a fresh warden holds `DIG_COOLDOWN` for 1200 ticks, which is
     * what stops it from immediately burrowing back out of sight.
     */
    initMemories: (context) =>
        context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.DIG_COOLDOWN, UNIT, WARDEN.diggingCooldown),
    updateActivity: (context) =>
        context.body.brain.setActiveActivityToFirstValid([
            Activities.EMERGE,
            Activities.DIG,
            Activities.ROAR,
            Activities.FIGHT,
            Activities.INVESTIGATE,
            Activities.SNIFF,
            Activities.IDLE
        ])
};
