/** The allay's brain. Transcribed from `AllayAi` in the 26.3 server jar. */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { behavior, countDownCooldownTicks } from '../behavior/builder.js';
import {
    animalPanic,
    goToWantedItem,
    lookAtTargetSink,
    moveToTargetSink,
    randomStroll,
    setEntityLookTargetSometimes,
    setWalkTargetFromLookTarget,
    swim,
    uniformInt
} from '../behavior/common.js';
import type { BehaviorControl } from '../behavior/control.js';
import { DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import { HurtBySensor, NearestItemSensor, NearestLivingEntitySensor, PlayerSensor } from '../sensing/sensors.js';
import type { BrainContext } from '../world.js';
import { blockPosTracker, distanceSquared } from '../world.js';

/** The named constants of `AllayAi`. */
export const ALLAY = {
    speedWhenIdling: 1,
    speedWhenFollowingDepositTarget: 2.25,
    speedWhenRetrievingItem: 1.75,
    speedWhenPanicking: 2.5,
    closeEnoughToTarget: 4,
    tooFarFromTarget: 16,
    maxLookDistance: 6,
    waitDuration: uniformInt(30, 60),
    timeToForgetNoteblock: 600,
    distanceToWantedItem: 32,
    giveItemTimeoutDuration: 20,
    itemPickupCooldownDuration: 60,
    /** The horizontal reach of `GlobalPos::isCloseEnough` for the liked note block. */
    noteblockRememberDistance: 1024
} as const;

/** Java's `AllayAi.hearNoteblock`: remembers the block and refreshes the 600-tick cooldown. */
export function hearNoteblock(context: BrainContext, pos: { x: number; y: number; z: number }): void {
    const brain = context.body.brain;
    const liked = brain.getMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_POSITION);
    const here = { dimension: context.world.dimension, pos };
    if (liked === undefined) {
        brain.setMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_POSITION, here);
        brain.setMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_COOLDOWN_TICKS, ALLAY.timeToForgetNoteblock);
    } else if (
        liked.dimension === here.dimension &&
        liked.pos.x === pos.x &&
        liked.pos.y === pos.y &&
        liked.pos.z === pos.z
    ) {
        brain.setMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_COOLDOWN_TICKS, ALLAY.timeToForgetNoteblock);
    }
}

/**
 * Java's `AllayAi.getItemDepositPosition`: the block above the liked note block, or the liked
 * player, and nothing when neither is valid. The note block memory is erased when the block is
 * gone, out of range or the cooldown ran out.
 */
export function itemDepositPosition(context: BrainContext): ReturnType<typeof blockPosTracker> | undefined {
    const brain = context.body.brain;
    const liked = brain.getMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_POSITION);
    if (liked !== undefined) {
        const close =
            liked.dimension === context.world.dimension &&
            distanceSquared(context.body.position, { x: liked.pos.x, y: liked.pos.y, z: liked.pos.z }) <=
                ALLAY.noteblockRememberDistance;
        const stillANoteBlock = context.world.blockAt(liked.pos) === 'minecraft:note_block';
        const cooldown = brain.getMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_COOLDOWN_TICKS);
        if (close && stillANoteBlock && cooldown !== undefined) {
            return blockPosTracker({ x: liked.pos.x, y: liked.pos.y + 1, z: liked.pos.z });
        }
        brain.eraseMemory(MemoryModuleTypes.LIKED_NOTEBLOCK_POSITION);
    }
    const player = brain.getMemory(MemoryModuleTypes.LIKED_PLAYER);
    const liked_player = (context.body.brain.getMemory(MemoryModuleTypes.NEAREST_PLAYERS) ?? []).find(
        (candidate) => candidate.id === player
    );
    return liked_player === undefined
        ? undefined
        : blockPosTracker({
              x: Math.floor(liked_player.position.x),
              y: Math.floor(liked_player.position.y),
              z: Math.floor(liked_player.position.z)
          });
}

/**
 * Java's `GoAndGiveItemsToTarget` and `StayCloseToTarget`, folded into one behavior.
 *
 * The throw itself is the host's, because it needs the allay's inventory and the item entity
 * factory. What the brain owns is the walk target to the deposit position and the 60-tick
 * `ITEM_PICKUP_COOLDOWN_TICKS` that follows a delivery, and that is what this keeps.
 */
function goAndGiveItemsToTarget(): BehaviorControl {
    return behavior('GoAndGiveItemsToTarget')
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .registered(MemoryModuleTypes.WALK_TARGET)
        .registered(MemoryModuleTypes.ITEM_PICKUP_COOLDOWN_TICKS)
        .build((context, lookTarget, walkTarget, cooldown) => {
            const deposit = itemDepositPosition(context);
            if (deposit === undefined) {
                return false;
            }
            const distance = Math.sqrt(distanceSquared(deposit.currentPosition(), context.body.position));
            if (distance <= ALLAY.closeEnoughToTarget) {
                cooldown.set(ALLAY.itemPickupCooldownDuration);
                walkTarget.erase();
                return true;
            }
            lookTarget.set(deposit);
            walkTarget.set({
                target: deposit,
                speedModifier: ALLAY.speedWhenFollowingDepositTarget,
                closeEnoughDist: ALLAY.closeEnoughToTarget
            });
            return true;
        });
}

/** Java's `StayCloseToTarget`, with the allay's 4 and 16 block bounds. */
function stayCloseToDepositTarget(): BehaviorControl {
    return behavior('StayCloseToTarget')
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .registered(MemoryModuleTypes.WALK_TARGET)
        .build((context, lookTarget, walkTarget) => {
            if (context.body.brain.hasMemoryValue(MemoryModuleTypes.NEAREST_VISIBLE_WANTED_ITEM)) {
                return false;
            }
            const deposit = itemDepositPosition(context);
            if (deposit === undefined) {
                return false;
            }
            const distance = Math.sqrt(distanceSquared(deposit.currentPosition(), context.body.position));
            if (distance < ALLAY.closeEnoughToTarget || distance > ALLAY.tooFarFromTarget) {
                return false;
            }
            lookTarget.set(deposit);
            walkTarget.set({
                target: deposit,
                speedModifier: ALLAY.speedWhenFollowingDepositTarget,
                closeEnoughDist: ALLAY.closeEnoughToTarget
            });
            return true;
        });
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            swim(0.8),
            animalPanic(ALLAY.speedWhenPanicking),
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            countDownCooldownTicks(MemoryModuleTypes.LIKED_NOTEBLOCK_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.ITEM_PICKUP_COOLDOWN_TICKS)
        ])
    );
}

function idleActivity(): ActivityData {
    return activityData(
        Activities.IDLE,
        prioritized(0, [
            goToWantedItem(ALLAY.speedWhenRetrievingItem, true, ALLAY.distanceToWantedItem),
            goAndGiveItemsToTarget(),
            stayCloseToDepositTarget(),
            setEntityLookTargetSometimes(ALLAY.maxLookDistance, ALLAY.waitDuration),
            new RunOne([
                [randomStroll(ALLAY.speedWhenIdling, 'air'), 2],
                [setWalkTargetFromLookTarget(ALLAY.speedWhenIdling, 3), 2],
                [new DoNothing(30, 60), 1]
            ])
        ])
    );
}

/** The allay's two activities: `core` and `idle`. It never fights and never panics by itself. */
export function allayActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity()];
}

/** The allay's registry entry. It keeps a liked player and a liked note block across ticks, and only ever picks `idle`. */
export const ALLAY_BRAIN: BrainMobDefinition = {
    id: 'minecraft:allay',
    memories: [
        MemoryModuleTypes.LIKED_PLAYER,
        MemoryModuleTypes.LIKED_NOTEBLOCK_POSITION,
        MemoryModuleTypes.LIKED_NOTEBLOCK_COOLDOWN_TICKS
    ],
    sensorTypes: ['nearest_living_entities', 'nearest_players', 'hurt_by', 'nearest_items'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            memories: ALLAY_BRAIN.memories,
            sensors: [new NearestLivingEntitySensor(), new PlayerSensor(), new HurtBySensor(), new NearestItemSensor()],
            activities: allayActivities()
        }),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.IDLE])
};
