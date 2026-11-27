/**
 * An entity moving into a block, routed to the block's data-driven `onStepOn` hook.
 *
 * Java's `Entity.checkInsideBlocks` calls `entityInside` on every block a body overlaps, which is
 * how a pressure plate, a detector rail or a tripwire learns something is on it. The entity
 * runtime reports each block a body's box has moved into, and this runs the hook of the block
 * there, when its state declares one.
 *
 * @javaSee Entity.checkInsideBlocks(Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/phys/Vec3;Lnet/minecraft/world/entity/InsideBlockEffectApplier$StepBasedCollector;Lit/unimi/dsi/fastutil/longs/LongSet;I)I
 */
import type { HookActor } from '@jsprismarine/blocks';
import type { BlockPosition } from '@jsprismarine/engine-systems';

import type { ServerContent } from '../content/ServerContent';
import type { World } from './World';

/**
 * Runs the `onStepOn` hook of the block at a position for an entity that moved into it.
 *
 * @returns Whether the block there declares the hook.
 */
export const dispatchStepOn = (content: ServerContent, world: World, at: BlockPosition, actor: HookActor): boolean => {
    const stored = world.loadedBlockAt(at.x, at.y, at.z);
    if (stored === undefined) return false;
    const state = content.blocks.types.get(stored.name)?.state(stored.states);
    if (state === undefined || !state.content.hooks.has('onStepOn')) return false;

    state.content.hooks.dispatch('onStepOn', {
        block: {
            identifier: stored.name,
            position: at,
            dimension: world.getDimension().name,
            level: world.getLevel().name,
            states: state.values
        },
        entity: actor
    });
    return true;
};
