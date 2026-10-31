/**
 * Items that answer a question about the world: where, when, and what is out
 * there.
 *
 * The needle, the dial and the zoom are all drawn by the client from the item
 * it holds, so the server's job is to keep the item's state right. That is
 * what these behaviors do, and it is why so little of them is an effect.
 */
import type { ItemHooks, ItemStack } from '@jsprismarine/items';

import type { ItemBehaviorSpec } from '../behavior';
import { consumeOne, withCooldown } from '../behavior';
import type { BlockPosition } from '../world';

/** The component a bound lodestone compass carries, which is Java's own key. */
export const LODESTONE_TRACKER = 'minecraft:lodestone_tracker';

/** The structure tag an eye of ender looks for. */
export const STRONGHOLD_DESTINATION = 'minecraft:eye_of_ender_located';

/**
 * The compass and the recovery compass.
 *
 * A plain compass points at the world spawn until it is used on a lodestone,
 * which binds it to that position and dimension; a recovery compass points at
 * the last death position. Both are read by the client off the stack, so the
 * behavior's work is writing the target onto it.
 */
export const compassBehavior: ItemBehaviorSpec = {
    name: 'vanilla:compass',
    hooks: ['onUseOn'],
    create: (context) => {
        const onUseOn: ItemHooks['onUseOn'] = ({ itemStack, block }) => {
            if (block.identifier !== 'minecraft:lodestone') return undefined;

            const bound = itemStack.copy();
            bound.set(LODESTONE_TRACKER, {
                target: { pos: [block.position.x, block.position.y, block.position.z] },
                tracked: true
            });
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:item.lodestone_compass.lock',
                position: block.position
            });
            return { stack: bound };
        };

        return { onUseOn };
    }
};

/**
 * Where a compass points.
 *
 * A server entry point rather than a hook, because the answer is read every
 * tick by whatever writes the item's state to the client.
 *
 * @returns The position to point at, or undefined when the needle should
 *   spin, which is a lodestone compass in the wrong dimension and a recovery
 *   compass with nowhere to go.
 */
export const compassTargetOf = (
    stack: ItemStack,
    spawn: BlockPosition,
    deathPosition: BlockPosition | undefined
): BlockPosition | undefined => {
    const tracker = stack.get(LODESTONE_TRACKER);
    if (tracker !== undefined && typeof tracker === 'object' && tracker !== null) {
        const target = Object.entries(tracker).find(([name]) => name === 'target')?.[1];
        const position = target === null || typeof target !== 'object' ? undefined : target;
        const coordinates =
            position === undefined ? undefined : Object.entries(position).find(([n]) => n === 'pos')?.[1];
        if (Array.isArray(coordinates) && coordinates.length === 3) {
            const [x, y, z] = coordinates;
            if (typeof x === 'number' && typeof y === 'number' && typeof z === 'number') return { x, y, z };
        }
    }
    if (stack.identifier === 'minecraft:recovery_compass') return deathPosition;
    return spawn;
};

/** The clock face, from 0 at noon round to 1, which is how Java indexes its sixty-four frames. */
export const clockReading = (timeOfDay: number): number => {
    const fraction = ((timeOfDay % 24000) + 24000) % 24000;
    return (((fraction / 24000 + 0.75) % 1) + 1) % 1;
};

/**
 * The spyglass.
 *
 * Zooming is the Bedrock client's, which it decides from the item it is
 * holding and the server cannot override. What the server does is play the
 * sound and hold the use open, so the client's own state machine matches.
 */
export const spyglassBehavior: ItemBehaviorSpec = {
    name: 'vanilla:spyglass',
    hooks: ['onUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ source, useDuration }) => {
            if (useDuration > 0) return {};
            context.world.perform({
                kind: 'play-sound',
                sound: 'minecraft:item.spyglass.use',
                position: context.world.stateOf(source).position
            });
            return {};
        };

        return { onUse };
    }
};

/**
 * The eye of ender, thrown toward the nearest stronghold.
 *
 * Filling a portal frame is the portal block family's job: its
 * `onPlayerInteract` takes the click for a held eye before any item hook
 * runs, writes `end_portal_eye_bit` and activates a completed ring, so an
 * `onUseOn` here would never fire for a frame.
 */
export const eyeOfEnderBehavior: ItemBehaviorSpec = {
    name: 'vanilla:eye_of_ender',
    hooks: ['onUse'],
    create: (context) => {
        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            context.world.perform({ kind: 'locate', source, destination: STRONGHOLD_DESTINATION });
            context.world.perform({
                kind: 'spawn-entity',
                identifier: 'minecraft:eye_of_ender',
                position: context.world.stateOf(source).position
            });
            return { stack: consumeOne(itemStack, context.world.stateOf(source).creative) };
        };

        return { onUse };
    }
};

/**
 * Maps: creating one from an empty map, and cloning, extending or locking one
 * at a cartography table.
 *
 * The map's own data model is the world's. What the item decides is which of
 * the four operations a use asks for, which is the part that depends on the
 * stack.
 */
export const mapBehavior: ItemBehaviorSpec = {
    name: 'vanilla:map',
    hooks: ['onUse'],
    create: (context) => {
        // Bedrock calls the empty map `minecraft:empty_map` and Java calls it
        // `minecraft:map`, so the component is the reliable test: a filled map
        // carries `minecraft:map_decorations` and an empty one does not.
        const empty = !('minecraft:map_decorations' in context.components);

        const onUse: ItemHooks['onUse'] = ({ itemStack, source }) => {
            if (!empty) return undefined;

            context.world.perform({ kind: 'map', operation: 'create', source, item: itemStack.copy(1) });
            return withCooldown(context.world, itemStack, source, {
                stack: consumeOne(itemStack, context.world.stateOf(source).creative)
            });
        };

        return { onUse };
    }
};

/** Every behavior this file declares. */
export const NAVIGATION_BEHAVIORS: readonly ItemBehaviorSpec[] = [
    compassBehavior,
    spyglassBehavior,
    eyeOfEnderBehavior,
    mapBehavior
];
