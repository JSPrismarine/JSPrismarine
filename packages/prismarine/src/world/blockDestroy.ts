/**
 * A block the world destroyed, run through the same hooks a player's break goes through.
 *
 * {@link import('./blockBreak').breakBlockWithContent} is the player's half: it raises
 * `onBreak` before the block goes and rolls Java's table with the tool in hand. Everything
 * else that takes a block out - a blast, a stream of water, a piston, fire, a falling anvil -
 * had its own rule, and there were four of them. One hardcoded a single copy of the block,
 * one rolled the table with no level view, one went through `WorldActions.dropItem` and one
 * through `WorldAccess.spawnItem`. None of them raised a hook, so a chest blown up by TNT
 * kept its contents and a double chest left its other half paired to air.
 *
 * This is the one rule they now share. A caller supplies what it knows - the blast radius,
 * whether the block yields anything at all - and gets back what to put on the ground.
 *
 * The write is deliberately not here. A blast writes air, a stream of water writes the water
 * and fire writes fire, and only the caller knows which; what it has to do is call this
 * first, because a family reads the block entity it is about to lose.
 */

import { blockFromContent } from '../block/Block';
import type { Block } from '../block/Block';
import type { ContentPosition } from '../content/world/adapter';
import type { Item } from '../item/Item';
import type { ServerContent } from '../content/ServerContent';
import { breakBlockWithContent } from './blockBreak';
import type { BreakWorld } from './blockBreak';

/** Air, which never yields anything however it is taken out. */
const AIR = 'minecraft:air';

/**
 * The world one destroyed block is in.
 *
 * {@link BreakWorld} plus the two things the fallback needs: the block catalog, which
 * answers what a block the content build has no type for yields, and the ground to put the
 * result on.
 */
export interface DestroyWorld extends BreakWorld {
    getServer(): {
        getContent?(): ServerContent | undefined;
        getLogger(): { error(error: unknown): void };
    };
    /** Puts the drops on the ground, one item entity each, popping out of the block. */
    dropFromBlock(block: ContentPosition, contents: Array<Block | Item | null>): Promise<void>;
}

/** One block being taken out of the world by something that is not a player. */
export interface BlockDestruction {
    readonly world: DestroyWorld;
    /** The block being destroyed, read before the caller writes over it. */
    readonly position: ContentPosition;
    /** The runtime id of the entity that caused the destruction, when known. */
    readonly sourceId?: number;
    /**
     * The radius of the blast that destroyed it, for a block an explosion took out.
     *
     * Java's `LootContextParams.EXPLOSION_RADIUS`, which `minecraft:explosion_decay` reads:
     * each item of a rolled stack survives with a chance of `1 / radius`.
     */
    readonly explosionRadius?: number;
    /**
     * Whether the block's own yield is rolled, true unless the caller says otherwise.
     *
     * False is Java's `Level.removeBlock(pos, false)`. Fire takes it, because a burned plank
     * leaves nothing, and so does a block a stream of lava turns to stone. The hook still
     * runs either way, so a burning chest still spills what it held.
     */
    readonly dropsBlock?: boolean;
}

/**
 * The drop for a block the content build has no type for, which is what the block catalog says.
 *
 * `Block.getDrops` with nothing in hand, the same call {@link import('./World').World.breakBlock}
 * falls back to. It is the one drop rule left that does not go through a loot table, and it
 * is reached only when there is no table to go through.
 */
const catalogDrops = (destruction: BlockDestruction): Array<Block | Item> => {
    const { world, position } = destruction;

    const standing = world.loadedBlockAt(position.x, position.y, position.z);
    if (standing === undefined || standing.name === AIR) return [];

    const server = world.getServer();
    const block = blockFromContent(standing.name, server.getContent?.());
    if (block === null) return [];

    return block.getDrops(null, server).filter((drop): drop is Block | Item => drop !== null);
};

/**
 * Runs the content hooks for a block the world destroyed and answers what it yields.
 *
 * @returns What to put on the ground, empty for a block that yields nothing. The hook has
 *   already run by the time this returns, so the caller may write over the block.
 */
export const destroyedBlockDrops = (destruction: BlockDestruction): Array<Block | Item> => {
    const { world, position, sourceId, explosionRadius, dropsBlock = true } = destruction;

    const rolled = breakBlockWithContent({ world, position, sourceId, explosionRadius, dropsBlock });
    if (rolled !== undefined) return rolled;

    // A block the content has no type for, or one whose chunk went out of memory under the
    // break. The hook did not run and there is no table to roll, so the catalog's own drop
    // stands in - and a block that was told not to yield anything still does not.
    return dropsBlock ? catalogDrops(destruction) : [];
};

/**
 * Destroys a block: raises its `onBreak` and puts what it yielded on the ground.
 *
 * The caller writes what stands in the block's place afterwards. Nothing is awaited, because
 * every caller is a system running inside the world tick and the item entity it spawns is
 * read by nobody this tick.
 */
export const destroyBlock = (destruction: BlockDestruction): void => {
    const { world, position } = destruction;

    const drops = destroyedBlockDrops(destruction);
    if (drops.length === 0) return;

    void world.dropFromBlock(position, drops).catch((error: unknown) => {
        world.getServer().getLogger().error(error);
    });
};
