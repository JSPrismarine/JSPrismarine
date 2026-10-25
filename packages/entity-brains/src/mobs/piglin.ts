/**
 * The piglin's brain. Transcribed from `PiglinAi` in the 26.3 server jar, 863 lines, the largest
 * of the nineteen `<Mob>Ai` classes.
 *
 * Seven activities, and the three that make a piglin a piglin are `admire_item`, `celebrate` and
 * `ride`. Bedrock expresses the outcomes of the first through `minecraft:barter`,
 * `minecraft:admire_item` and `behavior.barter`, but it has nowhere to put `ADMIRING_ITEM`,
 * `TIME_TRYING_TO_REACH_ADMIRE_ITEM`, `DISABLE_WALK_TO_ADMIRE_ITEM` and `ADMIRING_DISABLED`, which
 * are the four memories that decide what admiring actually does.
 */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { behavior, gatedBy, triggerIf } from '../behavior/builder.js';
import {
    copyMemoryWithExpiry,
    eraseMemoryIf,
    goToTargetLocation,
    goToWantedItem,
    has,
    interactWith,
    interactWithDoor,
    lookAtTargetSink,
    meleeAttack,
    moveToTargetSink,
    ofType,
    rangeOfSeconds,
    randomStroll,
    sample,
    setEntityLookTarget,
    setLookAndInteract,
    setWalkTargetAwayFrom,
    setWalkTargetFromAttackTargetIfTargetOutOfReach,
    setWalkTargetFromLookTarget,
    stopAttackingIfTargetInvalid
} from '../behavior/common.js';
import type { BehaviorControl } from '../behavior/control.js';
import { DoNothing } from '../behavior/control.js';
import { RunOne, triggerOneShuffled } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import {
    HurtBySensor,
    NearestItemSensor,
    NearestLivingEntitySensor,
    PiglinSpecificSensor,
    PlayerSensor
} from '../sensing/sensors.js';
import type { BrainContext, BrainEntity, BrainItem, BrainMob } from '../world.js';
import { bottomCenterOf, distanceSquared, EntityCondition } from '../world.js';

/** The named constants of `PiglinAi`. */
export const PIGLIN = {
    repellentDetectionRangeHorizontal: 8,
    repellentDetectionRangeVertical: 4,
    barteringItem: 'minecraft:gold_ingot',
    playerAngerRange: 16,
    angerDuration: 600,
    admireDuration: 119,
    maxDistanceToWalkToItem: 9,
    maxTimeToWalkToItem: 200,
    howLongToDisableAdmireWalkingIfCantReachItem: 200,
    celebrationTime: 300,
    maxTimeBetweenHunts: 120,
    timeBetweenHunts: rangeOfSeconds(30, 120),
    babyFleeDurationAfterGettingHit: 100,
    hitByPlayerMemoryTimeout: 400,
    maxWalkDistanceToStartRiding: 8,
    rideStartInterval: rangeOfSeconds(10, 40),
    rideDuration: rangeOfSeconds(10, 30),
    retreatDuration: rangeOfSeconds(5, 20),
    meleeAttackCooldown: 20,
    eatCooldown: 200,
    desiredDistanceFromEntityWhenAvoiding: 12,
    maxLookDist: 8,
    maxLookDistForPlayerHoldingLovedItem: 14,
    interactionRange: 8,
    minDesiredDistFromTargetWhenHoldingCrossbow: 5,
    speedWhenStrafingBackFromTarget: 0.75,
    desiredDistanceFromZombified: 6,
    avoidZombifiedDuration: rangeOfSeconds(5, 7),
    babyAvoidNemesisDuration: rangeOfSeconds(5, 7),
    probabilityOfCelebrationDance: 0.1,
    speedWhenAvoiding: 1,
    speedWhenRetreating: 1,
    speedWhenMounting: 0.8,
    speedWhenGoingToWantedItem: 1,
    speedWhenGoingToCelebrateLocation: 1,
    speedWhenDancing: 0.6,
    speedWhenIdling: 0.6,
    lovedItemTag: 'minecraft:piglin_loved',
    repellentItemTag: 'minecraft:piglin_repellents',
    ignoredByBabiesTag: 'minecraft:ignored_by_piglin_babies',
    barterCurrency: 'minecraft:gold_ingot',
    /** Both non-core activities start at priority 10. */
    activityBasePriority: 10
} as const;

/** Java's `PiglinAi.isLovedItem`. */
export function isLovedItem(item: BrainItem): boolean {
    return item.tags.has(PIGLIN.lovedItemTag);
}

/** Java's `PiglinAi.isBarterCurrency`: exactly one item, the gold ingot. */
export function isBarterCurrency(item: BrainItem): boolean {
    return item.id === PIGLIN.barterCurrency;
}

/** Java's `PiglinAi.isPlayerHoldingLovedItem`. */
export function isPlayerHoldingLovedItem(player: BrainEntity): boolean {
    return (
        (player.mainHandItem !== undefined && isLovedItem(player.mainHandItem)) ||
        (player.offHandItem !== undefined && isLovedItem(player.offHandItem))
    );
}

/** Java's `PiglinAi.isWearingSafeArmor`: any piece of gold armor makes a player safe. */
export function isWearingGoldArmor(player: BrainEntity): boolean {
    return (player.armorItems ?? []).some((item) => item.tags.has('minecraft:piglin_safe_armor'));
}

/**
 * Java's `PiglinAi.wantsToPickup`, the rule that decides what a piglin picks off the ground.
 *
 * Reading it in order is the clearest statement of the gold-armor economy: repellents are never
 * picked up, a baby skips the items in `#minecraft:ignored_by_piglin_babies`, a gold ingot is
 * taken only when the off hand is free, food is taken only when the piglin has not eaten, and
 * anything else goes by whether it beats what the piglin already holds.
 */
export function wantsToPickUp(item: BrainItem, context: BrainContext): boolean {
    const body = context.body;
    if (body.baby && item.tags.has(PIGLIN.ignoredByBabiesTag)) {
        return false;
    }
    if (item.tags.has(PIGLIN.repellentItemTag)) {
        return false;
    }
    if (
        body.brain.hasMemoryValue(MemoryModuleTypes.ADMIRING_DISABLED) &&
        body.brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET)
    ) {
        return false;
    }
    if (isBarterCurrency(item)) {
        return isNotHoldingLovedItemInOffHand(body);
    }
    if (item.id === 'minecraft:gold_nugget') {
        return true;
    }
    if (item.tags.has('minecraft:piglin_food')) {
        return !body.brain.hasMemoryValue(MemoryModuleTypes.ATE_RECENTLY);
    }
    return !isLovedItem(item) || isNotHoldingLovedItemInOffHand(body);
}

/** Java's `PiglinAi.isNotHoldingLovedItemInOffHand`. */
export function isNotHoldingLovedItemInOffHand(body: BrainMob): boolean {
    return body.offHandItem === undefined || !isLovedItem(body.offHandItem);
}

/** Java's `PiglinAi.canAdmire`: an adult that is not already admiring, offered a gold ingot. */
export function canAdmire(body: BrainMob, offered: BrainItem): boolean {
    return (
        !body.brain.hasMemoryValue(MemoryModuleTypes.ADMIRING_DISABLED) &&
        !body.brain.hasMemoryValue(MemoryModuleTypes.ADMIRING_ITEM) &&
        !body.baby &&
        isBarterCurrency(offered)
    );
}

/**
 * Java's `PiglinAi.mobInteract` and `pickUpItem`, reduced to what the brain owns.
 *
 * Giving a piglin gold writes `ADMIRING_ITEM` with the 119-tick admire duration and stops the
 * piglin walking; what happens to the item and what comes back out of the barter loot table is
 * the host's, and `onBarter` is where that lands.
 */
export function admireGoldItem(context: BrainContext): void {
    context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.ADMIRING_ITEM, true, PIGLIN.admireDuration);
    context.body.brain.eraseMemory(MemoryModuleTypes.WALK_TARGET);
    context.body.navigation.stop();
}

/** Java's `PiglinAi.setPiglinAngerTarget`: a 600-tick grudge, keyed by identity. */
export function setPiglinAngerTarget(context: BrainContext, target: BrainEntity): void {
    if (!context.world.isAttackable(context.body, target)) {
        return;
    }
    context.body.brain.eraseMemory(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE);
    context.body.brain.setMemoryWithExpiry(MemoryModuleTypes.ANGRY_AT, target.id, PIGLIN.angerDuration);
}

/** Java's `PiglinAi.isNearZombified`: a zombified piglin within six blocks pacifies a piglin. */
export function isNearZombified(body: BrainMob): boolean {
    const zombified = body.brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ZOMBIFIED);
    return (
        zombified !== undefined &&
        distanceSquared(zombified.position, body.position) <= PIGLIN.desiredDistanceFromZombified ** 2
    );
}

/**
 * Java's `PiglinAi.findPiglinAttackTarget`.
 *
 * The order is the whole of a piglin's hostility: nothing while near a zombified piglin, then the
 * grudge, then a player only when universal anger is on, then the nemesis, then a player not
 * wearing gold.
 */
export function findPiglinAttackTarget(context: BrainContext): BrainEntity | undefined {
    const brain = context.body.brain;
    if (isNearZombified(context.body)) {
        return undefined;
    }
    const angryAtId = brain.getMemory(MemoryModuleTypes.ANGRY_AT);
    const angryAt = (brain.getMemory(MemoryModuleTypes.NEAREST_LIVING_ENTITIES) ?? []).find(
        (entity) => entity.id === angryAtId && context.world.isAttackable(context.body, entity)
    );
    if (angryAt !== undefined) {
        return angryAt;
    }
    if (brain.hasMemoryValue(MemoryModuleTypes.UNIVERSAL_ANGER)) {
        const player = brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_ATTACKABLE_PLAYER);
        if (player !== undefined) {
            return player;
        }
    }
    const nemesis = brain.getMemory(MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS);
    if (nemesis !== undefined) {
        return nemesis;
    }
    const notWearingGold = brain.getMemory(MemoryModuleTypes.NEAREST_TARGETABLE_PLAYER_NOT_WEARING_GOLD);
    return notWearingGold !== undefined && context.world.isAttackable(context.body, notWearingGold)
        ? notWearingGold
        : undefined;
}

/** Java's `PiglinAi.wantsToStopFleeing`: an adult with a visible ally stops running. */
function wantsToStopFleeing(context: BrainContext): boolean {
    return !context.body.baby && (context.body.brain.getMemory(MemoryModuleTypes.VISIBLE_ADULT_PIGLIN_COUNT) ?? 0) > 0;
}

/** Java's `PiglinAi.avoidRepellent`. */
function avoidRepellent(): BehaviorControl {
    return setWalkTargetAwayFrom(
        MemoryModuleTypes.NEAREST_REPELLENT,
        bottomCenterOf,
        PIGLIN.speedWhenAvoiding,
        PIGLIN.repellentDetectionRangeHorizontal,
        false
    );
}

/** Java's `PiglinAi.babyAvoidNemesis`. */
function babyAvoidNemesis(): BehaviorControl {
    return copyMemoryWithExpiry(
        (body) => body.baby,
        MemoryModuleTypes.NEAREST_VISIBLE_NEMESIS,
        MemoryModuleTypes.AVOID_TARGET,
        PIGLIN.babyAvoidNemesisDuration
    );
}

/** Java's `PiglinAi.avoidZombified`. */
function avoidZombified(): BehaviorControl {
    return copyMemoryWithExpiry(
        isNearZombified,
        MemoryModuleTypes.NEAREST_VISIBLE_ZOMBIFIED,
        MemoryModuleTypes.AVOID_TARGET,
        PIGLIN.avoidZombifiedDuration
    );
}

/** Java's `StopHoldingItemIfNoLongerAdmiring`: hands the ingot back once the timer runs out. */
function stopHoldingItemIfNoLongerAdmiring(onBarter?: (context: BrainContext) => void): BehaviorControl {
    return triggerIf('StopHoldingItemIfNoLongerAdmiring', (body, context) => {
        if (body.offHandItem === undefined || body.brain.hasMemoryValue(MemoryModuleTypes.ADMIRING_ITEM)) {
            return false;
        }
        if (!body.baby && isBarterCurrency(body.offHandItem)) {
            onBarter?.(context);
        }
        return true;
    });
}

/** Java's `StartAdmiringItemIfSeen`: seeing a wanted item on the ground starts the 119-tick timer. */
function startAdmiringItemIfSeen(admireDuration: number): BehaviorControl {
    return behavior('StartAdmiringItemIfSeen')
        .present(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM)
        .absent(MemoryModuleTypes.ADMIRING_ITEM)
        .absent(MemoryModuleTypes.ADMIRING_DISABLED)
        .absent(MemoryModuleTypes.DISABLE_WALK_TO_ADMIRE_ITEM)
        .build((_context, wantedItem, admiringItem) => {
            if (!isLovedItem(wantedItem.get().item)) {
                return false;
            }
            admiringItem.setWithExpiry(true, admireDuration);
            return true;
        });
}

/** Java's `StopAdmiringIfItemTooFarAway`: nine blocks is the admire leash. */
function stopAdmiringIfItemTooFarAway(maxDistance: number): BehaviorControl {
    return behavior('StopAdmiringIfItemTooFarAway')
        .present(MemoryModuleTypes.ADMIRING_ITEM)
        .registered(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM)
        .build((context, admiringItem, wantedItem) => {
            if (context.body.offHandItem !== undefined) {
                return false;
            }
            const item = wantedItem.tryGet();
            if (item !== undefined && distanceSquared(item.position, context.body.position) <= maxDistance ** 2) {
                return false;
            }
            admiringItem.erase();
            return true;
        });
}

/**
 * Java's `StopAdmiringIfTiredOfTryingToReachItem`.
 *
 * `TIME_TRYING_TO_REACH_ADMIRE_ITEM` counts up to 200; past that the piglin gives up and holds
 * `DISABLE_WALK_TO_ADMIRE_ITEM` for another 200, so it stops pathing to an item it cannot reach
 * but still wants one that lands in front of it.
 */
function stopAdmiringIfTiredOfTryingToReachItem(maxTime: number, disableTime: number): BehaviorControl {
    return behavior('StopAdmiringIfTiredOfTryingToReachItem')
        .present(MemoryModuleTypes.ADMIRING_ITEM)
        .registered(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM)
        .registered(MemoryModuleTypes.TIME_TRYING_TO_REACH_ADMIRE_ITEM)
        .registered(MemoryModuleTypes.DISABLE_WALK_TO_ADMIRE_ITEM)
        .build((context, admiringItem, wantedItem, timeTrying, disableWalk) => {
            if (context.body.offHandItem !== undefined || wantedItem.tryGet() === undefined) {
                return false;
            }
            const elapsed = (timeTrying.tryGet() ?? 0) + 1;
            if (elapsed <= maxTime) {
                timeTrying.set(elapsed);
                return true;
            }
            admiringItem.erase();
            timeTrying.erase();
            disableWalk.setWithExpiry(true, disableTime);
            return true;
        });
}

/** Java's `StartCelebratingIfTargetDead`, with the 300-tick celebration and the 10% dance chance. */
function startCelebratingIfTargetDead(celebrationTime: number): BehaviorControl {
    return behavior('StartCelebratingIfTargetDead')
        .present(MemoryModuleTypes.ATTACK_TARGET)
        .registered(MemoryModuleTypes.ANGRY_AT)
        .registered(MemoryModuleTypes.CELEBRATE_LOCATION)
        .registered(MemoryModuleTypes.DANCING)
        .build((context, attackTarget, angryAt, celebrateLocation, dancing) => {
            const target = attackTarget.get();
            if (target.alive) {
                return false;
            }
            if (target.type === 'minecraft:hoglin' && context.world.random() < PIGLIN.probabilityOfCelebrationDance) {
                dancing.setWithExpiry(true, celebrationTime);
            }
            celebrateLocation.setWithExpiry(
                {
                    x: Math.floor(target.position.x),
                    y: Math.floor(target.position.y),
                    z: Math.floor(target.position.z)
                },
                celebrationTime
            );
            angryAt.erase();
            attackTarget.erase();
            return true;
        });
}

/** Java's `StopBeingAngryIfTargetDead`: drops the grudge once the target is gone. */
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

/** Java's `StartHuntingHoglin`: `HUNTED_RECENTLY` is the 30 to 120 second hunt cooldown. */
function startHuntingHoglin(): BehaviorControl {
    return behavior('StartHuntingHoglin')
        .present(MemoryModuleTypes.NEAREST_VISIBLE_HUNTABLE_HOGLIN)
        .absent(MemoryModuleTypes.ANGRY_AT)
        .absent(MemoryModuleTypes.ATTACK_TARGET)
        .absent(MemoryModuleTypes.HUNTED_RECENTLY)
        .build((context, hoglin, _angryAt, attackTarget, huntedRecently) => {
            if (context.body.baby) {
                return false;
            }
            attackTarget.set(hoglin.get());
            huntedRecently.setWithExpiry(
                true,
                sample(PIGLIN.timeBetweenHunts, (bound) => context.world.randomInt(bound))
            );
            return true;
        });
}

/** Java's `RememberIfHoglinWasKilled`: arms the hunt cooldown after a kill. */
function rememberIfHoglinWasKilled(): BehaviorControl {
    return behavior('RememberIfHoglinWasKilled')
        .present(MemoryModuleTypes.ATTACK_TARGET)
        .registered(MemoryModuleTypes.HUNTED_RECENTLY)
        .build((context, attackTarget, huntedRecently) => {
            const target = attackTarget.get();
            if (target.type !== 'minecraft:hoglin' || target.alive) {
                return false;
            }
            huntedRecently.setWithExpiry(
                true,
                sample(PIGLIN.timeBetweenHunts, (bound) => context.world.randomInt(bound))
            );
            return true;
        });
}

/** Java's `PiglinAi.babySometimesRideBabyHoglin`. */
function babySometimesRideBabyHoglin(): BehaviorControl {
    return copyMemoryWithExpiry(
        (body) => body.baby,
        MemoryModuleTypes.NEAREST_VISIBLE_BABY_HOGLIN,
        MemoryModuleTypes.RIDE_TARGET,
        PIGLIN.rideStartInterval
    );
}

/** Java's `Mount` and `DismountOrSkipMounting`, reduced to the memory they share. */
function mountRideTarget(): BehaviorControl {
    return behavior('Mount')
        .present(MemoryModuleTypes.RIDE_TARGET)
        .registered(MemoryModuleTypes.WALK_TARGET)
        .build((context, rideTarget, walkTarget) => {
            const mount = rideTarget.get();
            if (distanceSquared(mount.position, context.body.position) > PIGLIN.maxWalkDistanceToStartRiding ** 2) {
                rideTarget.erase();
                return true;
            }
            walkTarget.set({
                target: {
                    currentPosition: () => mount.position,
                    currentBlockPosition: () => ({
                        x: Math.floor(mount.position.x),
                        y: Math.floor(mount.position.y),
                        z: Math.floor(mount.position.z)
                    }),
                    entity: mount
                },
                speedModifier: PIGLIN.speedWhenMounting,
                closeEnoughDist: 0
            });
            return true;
        });
}

/** Java's `PiglinAi.createLookBehaviors`, shared by `idle` and `ride`. */
function lookBehaviors(): readonly (readonly [BehaviorControl, number])[] {
    return [
        [setEntityLookTarget(ofType('minecraft:player'), PIGLIN.maxLookDist), 1],
        [setEntityLookTarget(ofType('minecraft:piglin'), PIGLIN.maxLookDist), 1],
        [setEntityLookTarget(() => true, PIGLIN.maxLookDist), 1]
    ];
}

/** Java's `PiglinAi.createIdleLookBehaviors`. */
function idleLookBehaviors(): RunOne {
    return new RunOne([...lookBehaviors(), [new DoNothing(30, 60), 1]]);
}

/** Java's `PiglinAi.createIdleMovementBehaviors`. */
function idleMovementBehaviors(): RunOne {
    return new RunOne([
        [randomStroll(PIGLIN.speedWhenIdling), 2],
        [
            interactWith(
                'minecraft:piglin',
                PIGLIN.interactionRange,
                MemoryModuleTypes.INTERACTION_TARGET,
                PIGLIN.speedWhenIdling,
                2
            ),
            2
        ],
        [
            gatedBy(
                (body) => !body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_PLAYER_HOLDING_WANTED_ITEM),
                setWalkTargetFromLookTarget(PIGLIN.speedWhenIdling, 3)
            ),
            2
        ],
        [new DoNothing(30, 60), 1]
    ]);
}

function coreActivity(onBarter?: (context: BrainContext) => void): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            interactWithDoor(),
            babyAvoidNemesis(),
            avoidZombified(),
            stopHoldingItemIfNoLongerAdmiring(onBarter),
            startAdmiringItemIfSeen(PIGLIN.admireDuration),
            startCelebratingIfTargetDead(PIGLIN.celebrationTime),
            stopBeingAngryIfTargetDead()
        ])
    );
}

function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        prioritized(PIGLIN.activityBasePriority, [
            setEntityLookTarget(
                (entity) => entity.type === 'minecraft:player' && isPlayerHoldingLovedItem(entity),
                PIGLIN.maxLookDistForPlayerHoldingLovedItem
            ),
            startAttackingAsAdult(),
            gatedBy((body) => !body.baby, startHuntingHoglin()),
            avoidRepellent(),
            babySometimesRideBabyHoglin(),
            idleLookBehaviors(),
            idleMovementBehaviors(),
            setLookAndInteract('minecraft:player', 4)
        ])
    );
}

function startAttackingAsAdult(): BehaviorControl {
    return behavior('StartAttacking')
        .absent(MemoryModuleTypes.ATTACK_TARGET)
        .registered(MemoryModuleTypes.CANT_REACH_WALK_TARGET_SINCE)
        .build((context, attackTarget, cantReachSince) => {
            if (context.body.baby) {
                return false;
            }
            const target = findPiglinAttackTarget(context);
            if (target === undefined) {
                return false;
            }
            attackTarget.set(target);
            cantReachSince.erase();
            return true;
        });
}

function fightActivity(): ActivityData {
    return activityData(
        Activities.FIGHT,
        prioritized(PIGLIN.activityBasePriority, [
            stopAttackingIfTargetInvalid({
                stopAttackingWhen: (context, target) => findPiglinAttackTarget(context) !== target
            }),
            gatedBy(hasCrossbow, backUpIfTooClose()),
            setWalkTargetFromAttackTargetIfTargetOutOfReach(1),
            meleeAttack(PIGLIN.meleeAttackCooldown),
            rememberIfHoglinWasKilled(),
            eraseMemoryIf(isNearZombified, MemoryModuleTypes.ATTACK_TARGET)
        ]),
        { gatedBy: MemoryModuleTypes.ATTACK_TARGET }
    );
}

/** Java's `PiglinAi.hasCrossbow`. */
function hasCrossbow(body: BrainMob): boolean {
    return body.mainHandItem?.id === 'minecraft:crossbow';
}

/** Java's `BackUpIfTooClose.create(5, 0.75F)`. */
function backUpIfTooClose(): BehaviorControl {
    return behavior('BackUpIfTooClose')
        .absent(MemoryModuleTypes.WALK_TARGET)
        .present(MemoryModuleTypes.ATTACK_TARGET)
        .build((context, walkTarget, attackTarget) => {
            const target = attackTarget.get();
            if (
                distanceSquared(target.position, context.body.position) >
                PIGLIN.minDesiredDistFromTargetWhenHoldingCrossbow ** 2
            ) {
                return false;
            }
            const away = context.world.randomPos(context.body, {
                xzRange: 16,
                yRange: 7,
                medium: 'land',
                away: target.position
            });
            if (away === undefined) {
                return false;
            }
            walkTarget.set({
                target: {
                    currentPosition: () => away,
                    currentBlockPosition: () => ({
                        x: Math.floor(away.x),
                        y: Math.floor(away.y),
                        z: Math.floor(away.z)
                    })
                },
                speedModifier: PIGLIN.speedWhenStrafingBackFromTarget,
                closeEnoughDist: 0
            });
            return true;
        });
}

function celebrateActivity(): ActivityData {
    return activityData(
        Activities.CELEBRATE,
        prioritized(PIGLIN.activityBasePriority, [
            avoidRepellent(),
            setEntityLookTarget(
                (entity) => entity.type === 'minecraft:player' && isPlayerHoldingLovedItem(entity),
                PIGLIN.maxLookDistForPlayerHoldingLovedItem
            ),
            startAttackingAsAdult(),
            gatedBy(
                (body) => !has(body, EntityCondition.DANCING),
                goToTargetLocation(MemoryModuleTypes.CELEBRATE_LOCATION, 2, PIGLIN.speedWhenGoingToCelebrateLocation)
            ),
            gatedBy(
                (body) => has(body, EntityCondition.DANCING),
                goToTargetLocation(MemoryModuleTypes.CELEBRATE_LOCATION, 4, PIGLIN.speedWhenDancing)
            ),
            new RunOne([
                [setEntityLookTarget(ofType('minecraft:piglin'), PIGLIN.maxLookDist), 1],
                [randomStroll(PIGLIN.speedWhenIdling, 'land', { xzRange: 2, yRange: 1 }), 1],
                [new DoNothing(10, 20), 1]
            ])
        ]),
        { gatedBy: MemoryModuleTypes.CELEBRATE_LOCATION }
    );
}

function admireItemActivity(): ActivityData {
    return activityData(
        Activities.ADMIRE_ITEM,
        prioritized(PIGLIN.activityBasePriority, [
            goToWantedItem(
                PIGLIN.speedWhenGoingToWantedItem,
                true,
                PIGLIN.maxDistanceToWalkToItem,
                isNotHoldingLovedItemInOffHand
            ),
            stopAdmiringIfItemTooFarAway(PIGLIN.maxDistanceToWalkToItem),
            stopAdmiringIfTiredOfTryingToReachItem(
                PIGLIN.maxTimeToWalkToItem,
                PIGLIN.howLongToDisableAdmireWalkingIfCantReachItem
            )
        ]),
        { gatedBy: MemoryModuleTypes.ADMIRING_ITEM }
    );
}

function retreatActivity(): ActivityData {
    return activityData(
        Activities.AVOID,
        prioritized(PIGLIN.activityBasePriority, [
            setWalkTargetAwayFrom(
                MemoryModuleTypes.AVOID_TARGET,
                (entity) => entity.position,
                PIGLIN.speedWhenRetreating,
                PIGLIN.desiredDistanceFromEntityWhenAvoiding,
                true
            ),
            idleLookBehaviors(),
            idleMovementBehaviors(),
            eraseMemoryIf((_body, context) => wantsToStopFleeing(context), MemoryModuleTypes.AVOID_TARGET)
        ]),
        { gatedBy: MemoryModuleTypes.AVOID_TARGET }
    );
}

function rideHoglinActivity(): ActivityData {
    return activityData(
        Activities.RIDE,
        prioritized(PIGLIN.activityBasePriority, [
            mountRideTarget(),
            setEntityLookTarget(
                (entity) => entity.type === 'minecraft:player' && isPlayerHoldingLovedItem(entity),
                PIGLIN.maxLookDist
            ),
            // Java: `BehaviorBuilder.sequence(triggerIf(Entity::isPassenger), triggerOneShuffled(...))`
            triggerOneShuffled([
                ...lookBehaviors().map(
                    ([control, weight]) =>
                        [
                            (context: BrainContext, timestamp: number) =>
                                has(context.body, EntityCondition.PASSENGER) && control.tryStart(context, timestamp),
                            weight
                        ] as const
                ),
                [() => true, 1]
            ]),
            dismountOrSkipMounting()
        ]),
        { gatedBy: MemoryModuleTypes.RIDE_TARGET }
    );
}

/** Java's `DismountOrSkipMounting.create(8, PiglinAi::wantsToStopRiding)`. */
function dismountOrSkipMounting(): BehaviorControl {
    return behavior('DismountOrSkipMounting')
        .present(MemoryModuleTypes.RIDE_TARGET)
        .build((context, rideTarget) => {
            const mount = rideTarget.get();
            const tooFar =
                distanceSquared(mount.position, context.body.position) > PIGLIN.maxWalkDistanceToStartRiding ** 2;
            const wantsToStop = !mount.baby || !mount.alive;
            if (!tooFar && !wantsToStop) {
                return false;
            }
            rideTarget.erase();
            return true;
        });
}

export function piglinActivities(onBarter?: (context: BrainContext) => void): readonly ActivityData[] {
    return [
        coreActivity(onBarter),
        idleActivity(),
        admireItemActivity(),
        fightActivity(),
        celebrateActivity(),
        retreatActivity(),
        rideHoglinActivity()
    ];
}

/** Builds a piglin brain, with the host's barter hook wired into the core activity. */
export function makePiglinBrain(onBarter?: (context: BrainContext) => void): Brain {
    return new Brain({
        memories: PIGLIN_BRAIN.memories,
        sensors: [
            new NearestLivingEntitySensor(),
            new PlayerSensor(),
            new NearestItemSensor(wantsToPickUp),
            new HurtBySensor(),
            new PiglinSpecificSensor(isWearingGoldArmor, isPlayerHoldingLovedItem)
        ],
        activities: piglinActivities(onBarter)
    });
}

export const PIGLIN_BRAIN: BrainMobDefinition = {
    id: 'minecraft:piglin',
    memories: [
        MemoryModuleTypes.UNIVERSAL_ANGER,
        MemoryModuleTypes.ATE_RECENTLY,
        MemoryModuleTypes.SPEAR_FLEEING_TIME,
        MemoryModuleTypes.SPEAR_FLEEING_POSITION,
        MemoryModuleTypes.SPEAR_CHARGE_POSITION,
        MemoryModuleTypes.SPEAR_ENGAGE_TIME
    ],
    sensorTypes: ['nearest_living_entities', 'nearest_players', 'nearest_items', 'hurt_by', 'piglin_specific_sensor'],
    alsoRunsGoals: false,
    makeBrain: () => makePiglinBrain(),
    /** Java's `PiglinAi.initMemories`: the first hunt is one full interval away. */
    initMemories: (context) =>
        context.body.brain.setMemoryWithExpiry(
            MemoryModuleTypes.HUNTED_RECENTLY,
            true,
            sample(PIGLIN.timeBetweenHunts, (bound) => context.world.randomInt(bound))
        ),
    updateActivity: (context) => {
        const brain = context.body.brain;
        brain.setActiveActivityToFirstValid([
            Activities.ADMIRE_ITEM,
            Activities.FIGHT,
            Activities.AVOID,
            Activities.CELEBRATE,
            Activities.RIDE,
            Activities.IDLE
        ]);
        context.body.setCondition('aggressive', brain.hasMemoryValue(MemoryModuleTypes.ATTACK_TARGET));
        if (!brain.hasMemoryValue(MemoryModuleTypes.CELEBRATE_LOCATION)) {
            brain.eraseMemory(MemoryModuleTypes.DANCING);
        }
        context.body.setCondition(EntityCondition.DANCING, brain.hasMemoryValue(MemoryModuleTypes.DANCING));
    }
};
