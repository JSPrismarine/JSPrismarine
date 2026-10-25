/** The copper golem's brain. Transcribed from `CopperGolemAi` in the 26.3 server jar. */

import { Activities } from '../activity.js';
import type { ActivityData } from '../brain.js';
import { activityData, Brain, prioritized } from '../brain.js';
import { behavior, countDownCooldownTicks } from '../behavior/builder.js';
import {
    animalPanic,
    interactWithDoor,
    lookAtTargetSink,
    moveToTargetSink,
    randomStroll,
    setEntityLookTargetSometimes,
    uniformInt
} from '../behavior/common.js';
import type { BehaviorControl } from '../behavior/control.js';
import { conditions, DoNothing } from '../behavior/control.js';
import { RunOne } from '../behavior/gate.js';
import { MemoryModuleTypes } from '../memory.js';
import type { BrainMobDefinition } from '../registry.js';
import { HurtBySensor, NearestLivingEntitySensor } from '../sensing/sensors.js';
import { blockContaining, blockPosTracker } from '../world.js';

/** The named constants of `CopperGolemAi`. */
export const COPPER_GOLEM = {
    speedWhenPanicking: 1.5,
    speedWhenIdling: 1,
    transportItemHorizontalSearchRadius: 32,
    transportItemVerticalSearchRadius: 8,
    tickToStartOnReachedInteraction: 1,
    tickToPlayOnReachedSound: 9,
    /** The tick at which `TransportItemsBetweenContainers` closes the chest again. */
    tickToCloseContainer: 60,
    gazeInterval: uniformInt(40, 80),
    /** The source is `#minecraft:copper_chests`; the destination is a chest or a trapped chest. */
    sourceBlockTag: 'minecraft:copper_chests',
    destinationBlocks: new Set(['minecraft:chest', 'minecraft:trapped_chest'])
} as const;

/**
 * Java's `TransportItemsBetweenContainers`: walk to a copper chest, take an item, carry it to a
 * normal chest, drop it, and repeat.
 *
 * The container transfer itself is the host's, because it needs inventories; what the brain owns
 * is the walk target, `VISITED_BLOCK_POSITIONS`,
 * `UNREACHABLE_TRANSPORT_BLOCK_POSITIONS` and `TRANSPORT_ITEMS_COOLDOWN_TICKS`, and that is what
 * this keeps. The two chest kinds and the 32-by-8 search box are the Java constants.
 */
function transportItemsBetweenContainers(speedModifier: number): BehaviorControl {
    return behavior('TransportItemsBetweenContainers')
        .registered(MemoryModuleTypes.WALK_TARGET)
        .registered(MemoryModuleTypes.LOOK_TARGET)
        .registered(MemoryModuleTypes.VISITED_BLOCK_POSITIONS)
        .registered(MemoryModuleTypes.UNREACHABLE_TRANSPORT_BLOCK_POSITIONS)
        .absent(MemoryModuleTypes.TRANSPORT_ITEMS_COOLDOWN_TICKS)
        .build((context, walkTarget, lookTarget, visited, unreachable) => {
            const carrying = context.body.mainHandItem !== undefined;
            const skip = new Set(
                [...(visited.tryGet() ?? []), ...(unreachable.tryGet() ?? [])].map(
                    (pos) => `${pos.pos.x},${pos.pos.y},${pos.pos.z}`
                )
            );
            const found = context.world.findBlock(
                blockContaining(context.body.position),
                COPPER_GOLEM.transportItemHorizontalSearchRadius,
                COPPER_GOLEM.transportItemVerticalSearchRadius,
                (block, tags) =>
                    carrying ? COPPER_GOLEM.destinationBlocks.has(block) : tags.has(COPPER_GOLEM.sourceBlockTag)
            );
            if (found === undefined || skip.has(`${found.x},${found.y},${found.z}`)) {
                return false;
            }
            const tracker = blockPosTracker(found);
            lookTarget.set(tracker);
            walkTarget.set({ target: tracker, speedModifier, closeEnoughDist: 1 });
            visited.set([...(visited.tryGet() ?? []), { dimension: context.world.dimension, pos: found }]);
            return true;
        });
}

function coreActivity(): ActivityData {
    return activityData(
        Activities.CORE,
        prioritized(0, [
            animalPanic(COPPER_GOLEM.speedWhenPanicking),
            lookAtTargetSink(45, 90),
            moveToTargetSink(),
            interactWithDoor(),
            countDownCooldownTicks(MemoryModuleTypes.GAZE_COOLDOWN_TICKS),
            countDownCooldownTicks(MemoryModuleTypes.TRANSPORT_ITEMS_COOLDOWN_TICKS)
        ])
    );
}

function idleActivity(): ActivityData {
    return activityData(Activities.IDLE, [
        [0, transportItemsBetweenContainers(COPPER_GOLEM.speedWhenIdling)],
        [1, setEntityLookTargetSometimes(6, COPPER_GOLEM.gazeInterval, (entity) => entity.type === 'minecraft:player')],
        [
            2,
            new RunOne(
                [
                    [randomStroll(COPPER_GOLEM.speedWhenIdling, 'land', { xzRange: 2, yRange: 2 }), 1],
                    [new DoNothing(30, 60), 1]
                ],
                // Java gates this on the transport cooldown being present, so a golem only wanders
                // while it is explicitly resting between deliveries.
                conditions(
                    [MemoryModuleTypes.WALK_TARGET, 'value_absent'],
                    [MemoryModuleTypes.TRANSPORT_ITEMS_COOLDOWN_TICKS, 'value_present']
                )
            )
        ]
    ]);
}

export function copperGolemActivities(): readonly ActivityData[] {
    return [coreActivity(), idleActivity()];
}

export const COPPER_GOLEM_BRAIN: BrainMobDefinition = {
    id: 'minecraft:copper_golem',
    memories: [],
    sensorTypes: ['nearest_living_entities', 'hurt_by'],
    alsoRunsGoals: false,
    makeBrain: () =>
        new Brain({
            sensors: [new NearestLivingEntitySensor(), new HurtBySensor()],
            activities: copperGolemActivities()
        }),
    updateActivity: (context) => context.body.brain.setActiveActivityToFirstValid([Activities.IDLE])
};
