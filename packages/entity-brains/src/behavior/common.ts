/**
 * The shared behavior library: the behaviors more than one of the twenty mobs composes.
 *
 * Every constant here is read out of the pinned 26.3 server jar, and every memory condition is the
 * one the Java class declares. Mob-specific behaviors live beside their mob in `src/mobs/`.
 */

import type { Activity } from '../activity.js';
import type { MemoryModuleType } from '../memory.js';
import { MemoryModuleTypes, NO_VISIBLE_ENTITIES, UNIT } from '../memory.js';
import type { BrainContext, BrainEntity, BrainMob, Vec3, WalkTarget } from '../world.js';
import {
    blockContaining,
    blockPosTracker,
    bottomCenterOf,
    distanceSquared,
    entityTracker,
    EntityCondition
} from '../world.js';
import { behavior } from './builder.js';
import type { BehaviorControl, BehaviorHooks, MemoryConditions } from './control.js';
import { Behavior, conditions, OneShot } from './control.js';

/** A number drawn uniformly from an inclusive integer range. Java's `UniformInt`. */
export interface UniformInt {
    readonly min: number;
    readonly max: number;
}

/** Builds a {@link UniformInt}. Java's `UniformInt.of`. */
export function uniformInt(min: number, max: number): UniformInt {
    return { min, max };
}

/** Java's `TimeUtil.rangeOfSeconds`. */
export function rangeOfSeconds(min: number, max: number): UniformInt {
    return { min: min * 20, max: max * 20 };
}

/** Draws from a {@link UniformInt}. */
export function sample(range: UniformInt, randomInt: (bound: number) => number): number {
    return range.min + randomInt(range.max - range.min + 1);
}

/** Whether the mob carries a condition flag. */
export function has(entity: BrainEntity, condition: string): boolean {
    return entity.conditions.has(condition);
}

/** Java's `BehaviorUtils.isBreeding`: the mob is courting or has a breed target. */
export function isBreeding(body: BrainMob): boolean {
    return body.brain.hasMemoryValue(MemoryModuleTypes.BREED_TARGET);
}

/** Java's `BehaviorUtils.setWalkAndLookTargetMemories`. */
export function setWalkAndLookTargets(
    body: BrainMob,
    target: WalkTarget['target'],
    speedModifier: number,
    closeEnoughDist: number
): void {
    body.brain.setMemory(MemoryModuleTypes.LOOK_TARGET, target);
    body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
        target,
        speedModifier,
        closeEnoughDist
    });
}

/**
 * Java's `Swim`: jumps with probability `chance` each tick while the mob is in a floatable fluid.
 *
 * Every mob that can drown has it at priority 0 of its core activity.
 */
export function swim(chance: number): BehaviorControl {
    const inFluid = (context: BrainContext): boolean => has(context.body, EntityCondition.IN_WATER);
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: inFluid,
        canStillUse: (context) => inFluid(context),
        tick: (context) => {
            if (context.world.random() < chance) {
                context.body.jump();
            }
        }
    };
    return new Behavior('Swim', conditions(), hooks);
}

/** Java's `AnimalPanic.PANIC_MIN_DURATION` and `PANIC_MAX_DURATION`. */
export const PANIC_DURATION = { minDuration: 100, maxDuration: 120 };
/** Java's `AnimalPanic.PANIC_DISTANCE_HORIZONTAL` and `PANIC_DISTANCE_VERTICAL`. */
export const PANIC_DISTANCE = { xzRange: 5, yRange: 4 };

/** Options for {@link animalPanic}. */
export interface AnimalPanicOptions {
    /** The damage type tag that triggers a panic. Defaults to `minecraft:panic_causes`. */
    readonly panicCausingDamageTypes?: string;
    /** When set, the mob flees through the air at this height offset, as the happy ghast does. */
    readonly flyHeight?: number;
    readonly extraStartConditions?: (context: BrainContext) => boolean;
    readonly onStart?: (context: BrainContext) => void;
}

/**
 * Java's `AnimalPanic`.
 *
 * It runs for 100 to 120 ticks, holds `IS_PANICKING` for its whole duration, and redraws a flee
 * position each time the navigation finishes. The entry conditions are `REGISTERED` rather than
 * present, so the behavior itself decides whether to run: it starts when `HURT_BY` is a damage
 * type in the tag or when something else already set `IS_PANICKING`.
 */
export function animalPanic(speedMultiplier: number, options: AnimalPanicOptions = {}): BehaviorControl {
    const tag = options.panicCausingDamageTypes ?? 'minecraft:panic_causes';
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) => {
            if (options.extraStartConditions?.(context) === false) {
                return false;
            }
            const hurtBy = context.body.brain.getMemory(MemoryModuleTypes.HURT_BY);
            return (
                (hurtBy?.tags.has(tag) ?? false) || context.body.brain.hasMemoryValue(MemoryModuleTypes.IS_PANICKING)
            );
        },
        canStillUse: () => true,
        start: (context) => {
            context.body.brain.setMemory(MemoryModuleTypes.IS_PANICKING, true);
            context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            context.body.navigation.stop();
            options.onStart?.(context);
        },
        stop: (context) => context.body.brain.eraseMemory(MemoryModuleTypes.IS_PANICKING),
        tick: (context) => {
            if (!context.body.navigation.isDone()) {
                return;
            }
            const to = panicPosition(context, options.flyHeight);
            if (to !== undefined) {
                context.body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                    target: blockPosTracker(blockContaining(to)),
                    speedModifier: speedMultiplier,
                    closeEnoughDist: 0
                });
            }
        }
    };
    return new Behavior(
        'AnimalPanic',
        conditions([MemoryModuleTypes.IS_PANICKING, 'registered'], [MemoryModuleTypes.HURT_BY, 'registered']),
        hooks,
        PANIC_DURATION
    );
}

function panicPosition(context: BrainContext, flyHeight: number | undefined): Vec3 | undefined {
    if (has(context.body, EntityCondition.ON_FIRE)) {
        const water = context.world.findBlock(
            blockContaining(context.body.position),
            5,
            1,
            (block) => block === 'minecraft:water'
        );
        if (water !== undefined) {
            return bottomCenterOf(water);
        }
    }
    return context.world.randomPos(context.body, {
        ...PANIC_DISTANCE,
        medium: flyHeight === undefined ? 'land' : 'air'
    });
}

/**
 * Java's `LookAtTargetSink`: turns the head towards `LOOK_TARGET` and erases it when done.
 *
 * Every brain mob has it in its core activity, always as `new LookAtTargetSink(45, 90)`.
 */
export function lookAtTargetSink(minDuration: number, maxDuration: number): BehaviorControl {
    const hooks: BehaviorHooks = {
        canStillUse: (context) => context.body.brain.hasMemoryValue(MemoryModuleTypes.LOOK_TARGET),
        stop: (context) => context.body.brain.eraseMemory(MemoryModuleTypes.LOOK_TARGET),
        tick: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.LOOK_TARGET);
            if (target !== undefined) {
                context.body.lookAt(target.currentPosition());
            }
        }
    };
    return new Behavior('LookAtTargetSink', conditions([MemoryModuleTypes.LOOK_TARGET, 'value_present']), hooks, {
        minDuration,
        maxDuration
    });
}

/** Java's `MoveToTargetSink.MAX_COOLDOWN_BEFORE_RETRYING`. */
export const MOVE_TO_TARGET_SINK_MAX_RETRY_COOLDOWN = 40;

/** Options for {@link moveToTargetSink}. */
export interface MoveToTargetSinkOptions {
    /** Java's default is `(150, 250)`; the sniffer uses `(500, 700)` and the breeze `(20, 40)`. */
    readonly minDuration?: number;
    readonly maxDuration?: number;
    readonly extraStartConditions?: (context: BrainContext) => boolean;
    readonly onStart?: (context: BrainContext) => void;
    readonly onStop?: (context: BrainContext) => void;
}

/**
 * Java's `MoveToTargetSink`: the only behavior that drives navigation.
 *
 * It owns `WALK_TARGET`, `PATH` and `CANT_REACH_WALK_TARGET_SINCE`. A walk target it cannot reach
 * stamps the game time into `CANT_REACH_WALK_TARGET_SINCE`, which is what
 * {@link stopAttackingIfTargetInvalid} reads to give up after 200 ticks.
 */
export function moveToTargetSink(options: MoveToTargetSinkOptions = {}): BehaviorControl {
    let remainingCooldown = 0;
    let moving = false;

    const reachedTarget = (context: BrainContext, target: WalkTarget): boolean => {
        const at = blockContaining(context.body.position);
        const to = target.target.currentBlockPosition();
        return Math.abs(at.x - to.x) + Math.abs(at.y - to.y) + Math.abs(at.z - to.z) <= target.closeEnoughDist;
    };

    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) => {
            if (options.extraStartConditions?.(context) === false) {
                return false;
            }
            if (remainingCooldown > 0) {
                remainingCooldown--;
                return false;
            }
            const brain = context.body.brain;
            const target = brain.getMemory(MemoryModuleTypes.WALK_TARGET);
            if (target === undefined) {
                return false;
            }
            const reached = reachedTarget(context, target);
            if (!reached && context.body.navigation.canReach(target.target.currentPosition())) {
                brain.eraseMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE);
                return true;
            }
            if (!reached && !brain.hasMemoryValue(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE)) {
                brain.setMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE, context.world.gameTime());
            }
            brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            if (reached) {
                brain.eraseMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE);
            }
            return false;
        },
        start: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.WALK_TARGET);
            if (target === undefined) {
                return;
            }
            moving = context.body.navigation.moveTo(target.target.currentPosition(), target.speedModifier);
            options.onStart?.(context);
        },
        canStillUse: (context) => {
            if (!moving) {
                return false;
            }
            const target = context.body.brain.getMemory(MemoryModuleTypes.WALK_TARGET);
            return target !== undefined && !context.body.navigation.isDone() && !reachedTarget(context, target);
        },
        tick: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.WALK_TARGET);
            if (target !== undefined) {
                moving = context.body.navigation.moveTo(target.target.currentPosition(), target.speedModifier);
            }
        },
        stop: (context) => {
            const target = context.body.brain.getMemory(MemoryModuleTypes.WALK_TARGET);
            if (target !== undefined && !reachedTarget(context, target) && context.body.navigation.isStuck()) {
                remainingCooldown = context.world.randomInt(MOVE_TO_TARGET_SINK_MAX_RETRY_COOLDOWN);
            }
            context.body.navigation.stop();
            context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            context.body.brain.eraseMemory(MemoryModuleTypes.PATH);
            moving = false;
            options.onStop?.(context);
        }
    };

    return new Behavior(
        'MoveToTargetSink',
        conditions(
            [MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE, 'registered'],
            [MemoryModuleTypes.PATH, 'value_absent'],
            [MemoryModuleTypes.WALK_TARGET, 'value_present']
        ),
        hooks,
        { minDuration: options.minDuration ?? 150, maxDuration: options.maxDuration ?? 250 }
    );
}

/** A predicate over an entity a sensor or a behavior is choosing between. */
export type EntityPredicate = (entity: BrainEntity, context: BrainContext) => boolean;

/** Matches by entity type id, the form `SetEntityLookTarget.create(EntityType, dist)` takes. */
export function ofType(type: string): EntityPredicate {
    return (entity) => entity.type === type;
}

/** Java's `SetEntityLookTarget`: looks at the nearest visible entity matching the predicate. */
export function setEntityLookTarget(predicate: EntityPredicate, maxDist: number): OneShot {
    const maxDistSqr = maxDist * maxDist;
    return behavior('SetEntityLookTarget')
        .absent(MemoryModuleTypes.LOOK_TARGET)
        .present(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
        .build((context, lookTarget, nearest) => {
            const target = nearest
                .get()
                .findClosest(
                    (entity) =>
                        predicate(entity, context) &&
                        distanceSquared(entity.position, context.body.position) <= maxDistSqr
                );
            if (target === undefined) {
                return false;
            }
            lookTarget.set(entityTracker(target));
            return true;
        });
}

/**
 * Java's `SetEntityLookTargetSometimes`: the same, behind a countdown redrawn from `interval`.
 *
 * Java's `Ticker` refuses an interval whose minimum is 1 or less, and returns false on the tick
 * that reloads the countdown, so the first look happens at the end of the first interval.
 */
export function setEntityLookTargetSometimes(
    maxDist: number,
    interval: UniformInt,
    predicate: EntityPredicate = () => true
): OneShot {
    if (interval.min <= 1) {
        throw new Error(`SetEntityLookTargetSometimes needs an interval above 1, got ${interval.min}`);
    }
    const maxDistSqr = maxDist * maxDist;
    let ticksUntilNextStart = 0;
    return behavior('SetEntityLookTargetSometimes')
        .absent(MemoryModuleTypes.LOOK_TARGET)
        .present(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
        .build((context, lookTarget, nearest) => {
            const target = nearest
                .get()
                .findClosest(
                    (entity) =>
                        predicate(entity, context) &&
                        distanceSquared(entity.position, context.body.position) <= maxDistSqr
                );
            if (target === undefined) {
                return false;
            }
            if (ticksUntilNextStart === 0) {
                ticksUntilNextStart = sample(interval, (bound) => context.world.randomInt(bound)) - 1;
                return false;
            }
            if (--ticksUntilNextStart !== 0) {
                return false;
            }
            lookTarget.set(entityTracker(target));
            return true;
        });
}

/**
 * Java's `RandomLookAround`: picks a direction and writes it as a look target, then holds
 * `GAZE_COOLDOWN_TICKS` so it does not fire again until the interval elapses.
 */
export function randomLookAround(
    interval: UniformInt,
    maxYaw: number,
    minPitch: number,
    maxPitch: number
): BehaviorControl {
    if (minPitch > maxPitch) {
        throw new Error(`Minimum pitch is larger than maximum pitch! ${minPitch} > ${maxPitch}`);
    }
    const pitchRange = maxPitch - minPitch;
    const hooks: BehaviorHooks = {
        start: (context) => {
            const pitch = Math.max(-90, Math.min(90, context.world.random() * pitchRange + minPitch));
            const yaw = 2 * context.world.random() * maxYaw - maxYaw;
            const pitchRadians = (pitch * Math.PI) / 180;
            const yawRadians = (yaw * Math.PI) / 180;
            const horizontal = Math.cos(pitchRadians);
            const direction = {
                x: context.body.position.x - Math.sin(yawRadians) * horizontal,
                y: context.body.position.y - Math.sin(pitchRadians),
                z: context.body.position.z + Math.cos(yawRadians) * horizontal
            };
            context.body.brain.setMemory(MemoryModuleTypes.LOOK_TARGET, blockPosTracker(blockContaining(direction)));
            context.body.brain.setMemory(
                MemoryModuleTypes.GAZE_COOLDOWN_TICKS,
                sample(interval, (bound) => context.world.randomInt(bound))
            );
        }
    };
    return new Behavior(
        'RandomLookAround',
        conditions(
            [MemoryModuleTypes.LOOK_TARGET, 'value_absent'],
            [MemoryModuleTypes.GAZE_COOLDOWN_TICKS, 'value_absent']
        ),
        hooks
    );
}

/** Java's `RandomStroll.MAX_XZ_DIST` and `MAX_Y_DIST`. */
export const RANDOM_STROLL_RANGE = { xzRange: 10, yRange: 7 };

/** Java's `RandomStroll.stroll`, `fly` and `swim`, which differ only in the draw and the guard. */
export function randomStroll(
    speedModifier: number,
    medium: 'land' | 'air' | 'water' = 'land',
    range: { readonly xzRange: number; readonly yRange: number } = RANDOM_STROLL_RANGE,
    mayStrollFromWater = true
): OneShot {
    return behavior('RandomStroll')
        .absent(MemoryModuleTypes.WALK_TARGET)
        .build((context, walkTarget) => {
            const inWater = has(context.body, EntityCondition.IN_WATER);
            if (medium === 'water' ? !inWater : !mayStrollFromWater && inWater) {
                return false;
            }
            const to = context.world.randomPos(context.body, { ...range, medium });
            walkTarget.setOrErase(
                to === undefined
                    ? undefined
                    : { target: blockPosTracker(blockContaining(to)), speedModifier, closeEnoughDist: 0 }
            );
            return true;
        });
}

/** Java's `SetWalkTargetFromLookTarget`: walks to wherever the mob is already looking. */
export function setWalkTargetFromLookTarget(
    speedModifier: number | ((body: BrainMob) => number),
    closeEnoughDistance: number,
    canSet: (body: BrainMob, context: BrainContext) => boolean = () => true
): OneShot {
    return behavior('SetWalkTargetFromLookTarget')
        .absent(MemoryModuleTypes.WALK_TARGET)
        .present(MemoryModuleTypes.LOOK_TARGET)
        .build((context, walkTarget, lookTarget) => {
            if (!canSet(context.body, context)) {
                return false;
            }
            walkTarget.set({
                target: lookTarget.get(),
                speedModifier: typeof speedModifier === 'number' ? speedModifier : speedModifier(context.body),
                closeEnoughDist: closeEnoughDistance
            });
            return true;
        });
}

/** Java's `SetWalkTargetAwayFrom.pos` and `.entity`, which differ only in how they read a position. */
export function setWalkTargetAwayFrom<Value>(
    memory: MemoryModuleType<Value>,
    toPosition: (value: Value) => Vec3,
    speedModifier: number,
    desiredDistance: number,
    interruptCurrentWalk: boolean
): OneShot {
    return behavior('SetWalkTargetAwayFrom')
        .registered(MemoryModuleTypes.WALK_TARGET)
        .present(memory)
        .build((context, walkTarget, walkAwayFrom) => {
            const current = walkTarget.tryGet();
            if (current !== undefined && !interruptCurrentWalk) {
                return false;
            }
            const from = context.body.position;
            const avoid = toPosition(walkAwayFrom.get());
            if (distanceSquared(from, avoid) >= desiredDistance * desiredDistance) {
                return false;
            }
            if (current !== undefined && current.speedModifier === speedModifier) {
                const walking = current.target.currentPosition();
                const dot =
                    (walking.x - from.x) * (avoid.x - from.x) +
                    (walking.y - from.y) * (avoid.y - from.y) +
                    (walking.z - from.z) * (avoid.z - from.z);
                if (dot < 0) {
                    return false;
                }
            }
            for (let attempt = 0; attempt < 10; attempt++) {
                const to = context.world.randomPos(context.body, {
                    xzRange: 16,
                    yRange: 7,
                    medium: 'land',
                    away: avoid
                });
                if (to !== undefined) {
                    walkTarget.set({
                        target: blockPosTracker(blockContaining(to)),
                        speedModifier,
                        closeEnoughDist: 0
                    });
                    break;
                }
            }
            return true;
        });
}

/** Finds the entity a mob should attack, or nothing. Java's `StartAttacking.TargetFinder`. */
export type TargetFinder = (context: BrainContext) => BrainEntity | undefined;

/**
 * Java's `StartAttacking`: writes `ATTACK_TARGET` and clears the unreachable stamp.
 *
 * The entry condition is `ATTACK_TARGET` absent, so a mob already fighting never re-targets
 * through this behavior; that is what {@link stopAttackingIfTargetInvalid} is for.
 */
export function startAttacking(
    find: TargetFinder,
    canAttack: (context: BrainContext) => boolean = () => true
): OneShot {
    return behavior('StartAttacking')
        .absent(MemoryModuleTypes.ATTACK_TARGET)
        .registered(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE)
        .build((context, attackTarget, cantReachSince) => {
            if (!canAttack(context)) {
                return false;
            }
            const target = find(context);
            if (target === undefined || !context.world.isAttackable(context.body, target)) {
                return false;
            }
            attackTarget.set(target);
            cantReachSince.erase();
            return true;
        });
}

/** Java's `StopAttackingIfTargetInvalid.TIMEOUT_TO_GET_WITHIN_ATTACK_RANGE`. */
export const TIMEOUT_TO_GET_WITHIN_ATTACK_RANGE = 200;

/** Options for {@link stopAttackingIfTargetInvalid}. */
export interface StopAttackingOptions {
    /** An extra reason to drop the target. */
    readonly stopAttackingWhen?: (context: BrainContext, target: BrainEntity) => boolean;
    readonly onTargetErased?: (context: BrainContext, target: BrainEntity) => void;
    /** Java's `canGrowTiredOfTryingToReachTarget`, true for every use but the warden's. */
    readonly canGrowTired?: boolean;
}

/**
 * Java's `StopAttackingIfTargetInvalid`: erases `ATTACK_TARGET` when it died, left, became
 * un-attackable, or has been unreachable for 200 ticks.
 */
export function stopAttackingIfTargetInvalid(options: StopAttackingOptions = {}): OneShot {
    const canGrowTired = options.canGrowTired ?? true;
    return behavior('StopAttackingIfTargetInvalid')
        .present(MemoryModuleTypes.ATTACK_TARGET)
        .registered(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE)
        .build((context, attackTarget, cantReachSince) => {
            const target = attackTarget.get();
            const since = cantReachSince.tryGet();
            const tired =
                canGrowTired &&
                since !== undefined &&
                context.world.gameTime() - since > TIMEOUT_TO_GET_WITHIN_ATTACK_RANGE;
            const valid =
                context.world.isAttackable(context.body, target) &&
                !tired &&
                target.alive &&
                options.stopAttackingWhen?.(context, target) !== true;
            if (!valid) {
                options.onTargetErased?.(context, target);
                attackTarget.erase();
            }
            return true;
        });
}

/** Java's `SetWalkTargetFromAttackTargetIfTargetOutOfReach.PROJECTILE_ATTACK_RANGE_BUFFER`. */
export const PROJECTILE_ATTACK_RANGE_BUFFER = 1;

/** Java's `SetWalkTargetFromAttackTargetIfTargetOutOfReach`: closes on the attack target. */
export function setWalkTargetFromAttackTargetIfTargetOutOfReach(
    speedModifier: number | ((body: BrainMob) => number)
): OneShot {
    return behavior('SetWalkTargetFromAttackTargetIfTargetOutOfReach')
        .registered(MemoryModuleTypes.WALK_TARGET)
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .present(MemoryModuleTypes.ATTACK_TARGET)
        .registered(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
        .build((context, walkTarget, lookTarget, attackTarget, nearest) => {
            const target = attackTarget.get();
            const visible = nearest.tryGet();
            if (visible?.contains(target) === true && context.world.isWithinMeleeRange(context.body, target)) {
                walkTarget.erase();
            } else {
                lookTarget.set(entityTracker(target));
                walkTarget.set({
                    target: entityTracker(target),
                    speedModifier: typeof speedModifier === 'number' ? speedModifier : speedModifier(context.body),
                    closeEnoughDist: 0
                });
            }
            return true;
        });
}

/**
 * Java's `MeleeAttack`: swings when the target is in reach and visible, then holds
 * `ATTACK_COOLING_DOWN` for the cooldown.
 */
export function meleeAttack(
    cooldownBetweenAttacks: number,
    canAttack: (body: BrainMob) => boolean = () => true
): OneShot {
    return behavior('MeleeAttack')
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .present(MemoryModuleTypes.ATTACK_TARGET)
        .absent(MemoryModuleTypes.ATTACK_COOLING_DOWN)
        .present(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
        .build((context, lookTarget, attackTarget, attackCoolingDown, nearest) => {
            const target = attackTarget.get();
            if (
                !canAttack(context.body) ||
                !context.world.isWithinMeleeRange(context.body, target) ||
                !nearest.get().contains(target)
            ) {
                return false;
            }
            lookTarget.set(entityTracker(target));
            context.body.attack(target);
            attackCoolingDown.setWithExpiry(true, cooldownBetweenAttacks);
            return true;
        });
}

/** Java's `EraseMemoryIf`. */
export function eraseMemoryIf(
    predicate: (body: BrainMob, context: BrainContext) => boolean,
    memory: MemoryModuleType<unknown>
): OneShot {
    return behavior('EraseMemoryIf')
        .present(memory)
        .build((context, slot) => {
            if (!predicate(context.body, context)) {
                return false;
            }
            slot.erase();
            return true;
        });
}

/** Java's `CopyMemoryWithExpiry`: the piglin's two avoidance behaviors are both this. */
export function copyMemoryWithExpiry<Value>(
    copyIf: (body: BrainMob) => boolean,
    source: MemoryModuleType<Value>,
    target: MemoryModuleType<Value>,
    duration: UniformInt
): OneShot {
    return behavior('CopyMemoryWithExpiry')
        .present(source)
        .absent(target)
        .build((context, from, to) => {
            if (!copyIf(context.body)) {
                return false;
            }
            to.setWithExpiry(
                from.get(),
                sample(duration, (bound) => context.world.randomInt(bound))
            );
            return true;
        });
}

/**
 * Java's `BecomePassiveIfMemoryPresent`: drops the attack target and holds `PACIFIED`.
 *
 * Both piglins and hoglins use it with their repellent memory and a 200-tick pacify duration.
 */
export function becomePassiveIfMemoryPresent(
    pacifyingMemory: MemoryModuleType<unknown>,
    pacifyDuration: number
): OneShot {
    return behavior('BecomePassiveIfMemoryPresent')
        .registered(MemoryModuleTypes.ATTACK_TARGET)
        .absent(MemoryModuleTypes.PACIFIED)
        .present(pacifyingMemory)
        .build((_context, attackTarget, pacified) => {
            pacified.setWithExpiry(true, pacifyDuration);
            attackTarget.erase();
            return true;
        });
}

/** Java's `BabyFollowAdult`: a baby trails an adult while it is between the range's bounds. */
export function babyFollowAdult(
    followRange: UniformInt,
    speedModifier: number | ((body: BrainMob) => number),
    nearestVisible: MemoryModuleType<BrainEntity> = MemoryModuleTypes.NEAREST_VISIBLE_ADULT
): OneShot {
    return behavior('BabyFollowAdult')
        .present(nearestVisible)
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .absent(MemoryModuleTypes.WALK_TARGET)
        .build((context, nearestAdult, lookTarget, walkTarget) => {
            if (!context.body.baby) {
                return false;
            }
            const adult = nearestAdult.get();
            const distance = Math.sqrt(distanceSquared(adult.position, context.body.position));
            if (distance >= followRange.max + 1 || distance < followRange.min) {
                return false;
            }
            lookTarget.set(entityTracker(adult));
            walkTarget.set({
                target: entityTracker(adult),
                speedModifier: typeof speedModifier === 'number' ? speedModifier : speedModifier(context.body),
                closeEnoughDist: followRange.min - 1
            });
            return true;
        });
}

/** Java's `FollowTemptation.TEMPTATION_COOLDOWN`. */
export const TEMPTATION_COOLDOWN = 100;
/** Java's `FollowTemptation.DEFAULT_CLOSE_ENOUGH_DIST` and `BACKED_UP_CLOSE_ENOUGH_DIST`. */
export const TEMPTATION_CLOSE_ENOUGH = { default: 2.5, backedUp: 3.5 };

/**
 * Java's `FollowTemptation`: walks towards the player holding the mob's food.
 *
 * `TEMPTING_PLAYER` comes from one of the four tempting sensors; this behavior only moves and sets
 * the cooldown that keeps a tempted mob from re-tempting the instant it stops.
 */
export function followTemptation(
    speedModifier: (body: BrainMob) => number,
    closeEnough: (body: BrainMob) => number = () => 2.5
): BehaviorControl {
    const hooks: BehaviorHooks = {
        timedOut: () => false,
        canStillUse: (context) =>
            context.body.brain.hasMemoryValue(MemoryModuleTypes.TEMPTING_PLAYER) &&
            !context.body.brain.hasMemoryValue(MemoryModuleTypes.BREED_TARGET) &&
            !context.body.brain.hasMemoryValue(MemoryModuleTypes.IS_PANICKING),
        stop: (context) => {
            context.body.brain.setMemory(MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS, TEMPTATION_COOLDOWN);
            context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            context.body.brain.eraseMemory(MemoryModuleTypes.LOOK_TARGET);
        },
        tick: (context) => {
            const player = context.body.brain.getMemory(MemoryModuleTypes.TEMPTING_PLAYER);
            if (player === undefined) {
                return;
            }
            context.body.brain.setMemory(MemoryModuleTypes.LOOK_TARGET, entityTracker(player));
            const close = closeEnough(context.body);
            if (distanceSquared(player.position, context.body.position) < close * close) {
                context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            } else {
                context.body.brain.setMemory(MemoryModuleTypes.WALK_TARGET, {
                    target: entityTracker(player),
                    speedModifier: speedModifier(context.body),
                    closeEnoughDist: 2
                });
            }
        }
    };
    return new Behavior(
        'FollowTemptation',
        conditions(
            [MemoryModuleTypes.LOOK_TARGET, 'registered'],
            [MemoryModuleTypes.WALK_TARGET, 'registered'],
            [MemoryModuleTypes.TEMPTATION_COOLDOWN_TICKS, 'value_absent'],
            [MemoryModuleTypes.TEMPTING_PLAYER, 'value_present'],
            [MemoryModuleTypes.BREED_TARGET, 'value_absent'],
            [MemoryModuleTypes.IS_PANICKING, 'value_absent']
        ),
        hooks
    );
}

/** Java's `AnimalMakeLove.BREED_RANGE`, `MIN_DURATION` and `MAX_DURATION`. */
export const ANIMAL_MAKE_LOVE = { breedRange: 3, minDuration: 60, maxDuration: 110 };

/**
 * Java's `AnimalMakeLove`: pairs with a nearby breeding partner of the same type.
 *
 * Both partners get the `BREED_TARGET` memory in Java; this writes the body's own, because the
 * partner is a {@link BrainEntity} view and not a brain. The spawn itself is the host's, since it
 * needs the entity type registry, and it happens 60 to 110 ticks in, which is what
 * `spawnChildAtTime` is here.
 */
export function animalMakeLove(partnerType: string, speedModifier = 1, closeEnough = 2): BehaviorControl {
    let spawnChildAtTime = 0;
    const partner = (context: BrainContext): BrainEntity | undefined =>
        context.body.brain
            .getMemory(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
            ?.findClosest(
                (entity) =>
                    entity.type === partnerType &&
                    entity.conditions.has(EntityCondition.IN_LOVE) &&
                    entity.conditions.has(EntityCondition.CAN_BREED)
            );
    const hooks: BehaviorHooks = {
        checkExtraStartConditions: (context) =>
            has(context.body, EntityCondition.IN_LOVE) && partner(context) !== undefined,
        canStillUse: (context, timestamp) => {
            const mate = context.body.brain.getMemory(MemoryModuleTypes.BREED_TARGET);
            return (
                mate !== undefined &&
                mate.alive &&
                timestamp <= spawnChildAtTime &&
                !context.body.brain.hasMemoryValue(MemoryModuleTypes.IS_PANICKING)
            );
        },
        start: (context, timestamp) => {
            const mate = partner(context);
            if (mate === undefined) {
                return;
            }
            context.body.brain.setMemory(MemoryModuleTypes.BREED_TARGET, mate);
            setWalkAndLookTargets(context.body, entityTracker(mate), speedModifier, closeEnough);
            spawnChildAtTime =
                timestamp +
                ANIMAL_MAKE_LOVE.minDuration +
                context.world.randomInt(ANIMAL_MAKE_LOVE.maxDuration - ANIMAL_MAKE_LOVE.minDuration);
        },
        tick: (context) => {
            const mate = context.body.brain.getMemory(MemoryModuleTypes.BREED_TARGET);
            if (mate !== undefined) {
                setWalkAndLookTargets(context.body, entityTracker(mate), speedModifier, closeEnough);
            }
        },
        stop: (context) => {
            context.body.brain.eraseMemory(MemoryModuleTypes.BREED_TARGET);
            context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
            context.body.brain.eraseMemory(MemoryModuleTypes.LOOK_TARGET);
            spawnChildAtTime = 0;
        }
    };
    return new Behavior(
        'AnimalMakeLove',
        conditions(
            [MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES, 'value_present'],
            [MemoryModuleTypes.BREED_TARGET, 'value_absent'],
            [MemoryModuleTypes.WALK_TARGET, 'registered'],
            [MemoryModuleTypes.LOOK_TARGET, 'registered'],
            [MemoryModuleTypes.IS_PANICKING, 'value_absent']
        ),
        hooks,
        { minDuration: ANIMAL_MAKE_LOVE.maxDuration, maxDuration: ANIMAL_MAKE_LOVE.maxDuration }
    );
}

/** Java's `GoToWantedItem`: walks to the item `NearestItemSensor` picked out. */
export function goToWantedItem(
    speedModifier: number,
    interruptOngoingWalk: boolean,
    maxDistToWalk: number,
    predicate: (body: BrainMob) => boolean = () => true
): OneShot {
    const maxDistSqr = maxDistToWalk * maxDistToWalk;
    // Java picks `registered` or `absent` for WALK_TARGET from `interruptOngoingWalk`. Declaring
    // `registered` and refusing in the body when a walk is already running is the same behavior,
    // and it keeps one builder chain rather than two with different accessor tuples.
    return behavior('GoToWantedItem')
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .registered(MemoryModuleTypes.WALK_TARGET)
        .present(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM)
        .registered(MemoryModuleTypes.ITEM_PICKUP_COOLDOWN_TICKS)
        .build((context, lookTarget, walkTarget, wantedItem, cooldown) => {
            const item = wantedItem.get();
            if (
                (!interruptOngoingWalk && walkTarget.tryGet() !== undefined) ||
                cooldown.tryGet() !== undefined ||
                !predicate(context.body) ||
                distanceSquared(item.position, context.body.position) > maxDistSqr
            ) {
                return false;
            }
            lookTarget.set(entityTracker(item));
            walkTarget.set({ target: entityTracker(item), speedModifier, closeEnoughDist: 0 });
            return true;
        });
}

/** Java's `GoToTargetLocation`: walks to a block memory, scattered by up to one block. */
export function goToTargetLocation(
    locationMemory: MemoryModuleType<{ readonly x: number; readonly y: number; readonly z: number }>,
    closeEnoughDist: number,
    speedModifier: number
): OneShot {
    return behavior('GoToTargetLocation')
        .present(locationMemory)
        .absent(MemoryModuleTypes.ATTACK_TARGET)
        .absent(MemoryModuleTypes.WALK_TARGET)
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .build((context, location, _attackTarget, _walkTarget, _lookTarget) => {
            const pos = location.get();
            const at = blockContaining(context.body.position);
            const distance = Math.sqrt((pos.x - at.x) ** 2 + (pos.y - at.y) ** 2 + (pos.z - at.z) ** 2);
            if (distance >= closeEnoughDist) {
                const scattered = {
                    x: pos.x + context.world.randomInt(3) - 1,
                    y: pos.y,
                    z: pos.z + context.world.randomInt(3) - 1
                };
                setWalkAndLookTargets(context.body, blockPosTracker(scattered), speedModifier, closeEnoughDist);
            }
            return true;
        });
}

/** Java's `StrollToPoi`: walks to a point-of-interest memory, at most once every 80 ticks. */
export function strollToPoi(
    memory: MemoryModuleType<{ readonly dimension: string; readonly pos: { x: number; y: number; z: number } }>,
    speedModifier: number,
    closeEnoughDist: number,
    maxDistanceFromPoi: number
): OneShot {
    let nextOkStartTime = 0;
    return behavior('StrollToPoi')
        .registered(MemoryModuleTypes.WALK_TARGET)
        .present(memory)
        .build((context, walkTarget, poi) => {
            const target = poi.get();
            if (
                context.world.dimension !== target.dimension ||
                distanceSquared(bottomCenterOf(target.pos), context.body.position) >= maxDistanceFromPoi ** 2
            ) {
                return false;
            }
            const timestamp = context.world.gameTime();
            if (timestamp <= nextOkStartTime) {
                return true;
            }
            walkTarget.set({ target: blockPosTracker(target.pos), speedModifier, closeEnoughDist });
            nextOkStartTime = timestamp + 80;
            return true;
        });
}

/** Java's `StrollAroundPoi.MIN_TIME_BETWEEN_STROLLS`, `STROLL_MAX_XZ_DIST` and `STROLL_MAX_Y_DIST`. */
export const STROLL_AROUND_POI = { minTimeBetweenStrolls: 180, xzRange: 8, yRange: 6 };

/** Java's `StrollAroundPoi`: wanders near a point of interest, at most once every 180 ticks. */
export function strollAroundPoi(
    memory: MemoryModuleType<{ readonly dimension: string; readonly pos: { x: number; y: number; z: number } }>,
    speedModifier: number,
    maxDistanceFromPoi: number
): OneShot {
    let nextOkStartTime = 0;
    return behavior('StrollAroundPoi')
        .registered(MemoryModuleTypes.WALK_TARGET)
        .present(memory)
        .build((context, walkTarget, poi) => {
            const target = poi.get();
            if (
                context.world.dimension !== target.dimension ||
                distanceSquared(bottomCenterOf(target.pos), context.body.position) >= maxDistanceFromPoi ** 2
            ) {
                return false;
            }
            const timestamp = context.world.gameTime();
            if (timestamp <= nextOkStartTime) {
                return true;
            }
            const to = context.world.randomPos(context.body, {
                xzRange: STROLL_AROUND_POI.xzRange,
                yRange: STROLL_AROUND_POI.yRange,
                medium: 'land'
            });
            walkTarget.setOrErase(
                to === undefined
                    ? undefined
                    : { target: blockPosTracker(blockContaining(to)), speedModifier, closeEnoughDist: 1 }
            );
            nextOkStartTime = timestamp + STROLL_AROUND_POI.minTimeBetweenStrolls;
            return true;
        });
}

/** Java's `InteractWith`: walks up to a nearby mob of a type and remembers it as an interaction. */
export function interactWith(
    type: string,
    interactionRange: number,
    memory: MemoryModuleType<BrainEntity>,
    speedModifier: number,
    closeEnough: number
): OneShot {
    const rangeSqr = interactionRange * interactionRange;
    return behavior('InteractWith')
        .absent(MemoryModuleTypes.WALK_TARGET)
        .absent(MemoryModuleTypes.LOOK_TARGET)
        .absent(memory)
        .present(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
        .build((context, _walkTarget, _lookTarget, interactionTarget, nearest) => {
            const partner = nearest
                .get()
                .findClosest(
                    (entity) =>
                        entity.type === type && distanceSquared(entity.position, context.body.position) <= rangeSqr
                );
            if (partner === undefined) {
                return false;
            }
            interactionTarget.set(partner);
            setWalkAndLookTargets(context.body, entityTracker(partner), speedModifier, closeEnough);
            return true;
        });
}

/** Java's `SetLookAndInteract`: faces a nearby entity of a type and marks it as the interaction. */
export function setLookAndInteract(type: string, interactionRange: number): OneShot {
    const rangeSqr = interactionRange * interactionRange;
    return behavior('SetLookAndInteract')
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .absent(MemoryModuleTypes.INTERACTION_TARGET)
        .present(MemoryModuleTypes.NEAREST_VISIBLE_LIVING_ENTITIES)
        .build((context, lookTarget, interactionTarget, nearest) => {
            const partner = nearest
                .get()
                .findClosest(
                    (entity) =>
                        entity.type === type && distanceSquared(entity.position, context.body.position) <= rangeSqr
                );
            if (partner === undefined) {
                return false;
            }
            interactionTarget.set(partner);
            lookTarget.set(entityTracker(partner));
            return true;
        });
}

/**
 * Java's `InteractWithDoor`: opens the doors on the current path and closes them behind.
 *
 * The door state itself is the host's; what the brain owns is `DOORS_TO_CLOSE`, and that is what
 * this keeps. The behavior is in the core activity of the villager, the piglin, the piglin brute
 * and the copper golem.
 */
export function interactWithDoor(): OneShot {
    return behavior('InteractWithDoor')
        .registered(MemoryModuleTypes.DOORS_TO_CLOSE)
        .present(MemoryModuleTypes.PATH)
        .build((context, doorsToClose, path) => {
            const open = doorsToClose.tryGet() ?? [];
            const ahead = { dimension: context.world.dimension, pos: path.get().target };
            const isDoor = context.world.blockTagsAt(ahead.pos).has('minecraft:doors');
            if (!isDoor) {
                return false;
            }
            context.world.emitGameEvent('minecraft:block_open', bottomCenterOf(ahead.pos), context.body);
            doorsToClose.set([...open, ahead]);
            return true;
        });
}

/**
 * Java's `UpdateActivityFromSchedule`: the behavior at priority 99 of every villager activity.
 *
 * It is how a villager leaves `work` for `meet` on its own rather than waiting for a tick hook.
 */
export function updateActivityFromSchedule(): OneShot {
    return new OneShot('UpdateActivityFromSchedule', [], (context) => {
        context.body.brain.updateActivityFromSchedule(context.world.gameTime(), context.world.dayTime());
        return true;
    });
}

/** Java's `SetActivity`-style helper used by the warden and the sniffer to force one activity. */
export function setActivity(activity: Activity): OneShot {
    return new OneShot(`SetActivity[${activity.name}]`, [], (context) => {
        context.body.brain.setActiveActivityIfPossible(activity);
        return true;
    });
}

/**
 * A behavior whose body is a memory state machine on a timer: start writes the memory, the body
 * runs for `duration` ticks and the end erases it.
 *
 * Java spells these out one class each (`Emerging`, `Digging`, `Roar`, `Sniffing`, `PlayDead`),
 * and they differ only in the memory, the duration, the pose and the sound.
 */
export function timedState(
    name: string,
    duration: number,
    options: {
        readonly entryCondition?: MemoryConditions;
        readonly condition?: EntityConditionWrite;
        readonly eraseOnStop?: readonly MemoryModuleType<unknown>[];
        readonly startSound?: string;
        readonly onStart?: (context: BrainContext) => void;
        readonly onStop?: (context: BrainContext) => void;
    } = {}
): BehaviorControl {
    const hooks: BehaviorHooks = {
        canStillUse: () => true,
        start: (context) => {
            if (options.condition !== undefined) {
                context.body.setCondition(options.condition, true);
            }
            if (options.startSound !== undefined) {
                context.body.playSound(options.startSound);
            }
            options.onStart?.(context);
        },
        stop: (context) => {
            if (options.condition !== undefined) {
                context.body.setCondition(options.condition, false);
            }
            for (const memory of options.eraseOnStop ?? []) {
                context.body.brain.eraseMemory(memory);
            }
            options.onStop?.(context);
        }
    };
    return new Behavior(name, options.entryCondition ?? conditions(), hooks, {
        minDuration: duration,
        maxDuration: duration
    });
}

/** The name of a condition flag a behavior writes back to the body. */
export type EntityConditionWrite = string;

/** Java's `Unit` value, re-exported so a mob module writing a unit memory need not import memory.ts. */
export { UNIT };

/** The empty visible-entity set, re-exported for the same reason. */
export { NO_VISIBLE_ENTITIES };
