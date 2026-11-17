/**
 * A chest's lid, which stands open while anybody has the chest open.
 *
 * Java's `ChestBlockEntity` counts the players looking into it and signals the count with
 * `Level.blockEvent(pos, block, 1, count)` each time it changes; a count above zero opens the
 * lid and zero closes it. A Bedrock client reads the same pair from `BlockEventPacket`. A double
 * chest's halves share one screen, so both are sent the count of players looking into either.
 */
import { halvesOf } from './containerStore';
import type { ContentPosition } from '../content/world/adapter';
import type { World } from '../world/World';

/** Java's `ChestBlock` event type for the number of players looking into the chest. */
const OPENERS_EVENT = 1;

/**
 * Whether a block draws a lid that follows its openers: every chest, trapped chest, ender chest
 * and copper chest, and every shulker box. A barrel shows its open state through a block state
 * instead.
 */
export const hasContainerLid = (identifier: string): boolean =>
    identifier.endsWith('chest') || identifier.endsWith('shulker_box');

/**
 * Tells the players near a container how many players have it open, so its lid follows.
 *
 * @param world - The world the block is in, whose players are counted.
 * @param at - The block whose screen opened or closed.
 * @param identifier - The block standing there.
 */
export const showContainerLid = (world: World, at: ContentPosition, identifier: string): void => {
    if (!hasContainerLid(identifier)) return;
    const blocks = world.getServer().getContent().world.blockWorld.at(world.getDimension().name, world.getLevel().name);
    const halves = halvesOf(blocks, at, identifier);
    const openers = world.getViewers().filter((session) => {
        const open = session.getOpenBlockContainer();
        if (open === undefined || open.trade !== undefined) return false;
        const position = open.position;
        return halves.some(
            (half) => half.x === position.getX() && half.y === position.getY() && half.z === position.getZ()
        );
    }).length;

    for (const half of halves) world.sendBlockEvent(half, OPENERS_EVENT, openers);
};
