/**
 * The world `@jsprismarine/engine-systems` reads and writes, over this server's chunks.
 *
 * Redstone and explosions never see a chunk, a palette or a player. Their world views are built
 * out of the handful of things a {@link World} already does. Reads are synchronous and stay
 * inside loaded chunks, so a system never waits for a chunk to load.
 *
 * The engine spells a block's states Java's way - `facing_direction` holds a direction word
 * where Bedrock holds a number, and the number is per block - so every block is translated on
 * the way in and back on the way out, through `@jsprismarine/mapping`, which is the one place
 * allowed to know that two editions exist.
 */
import { containerSignal } from '@jsprismarine/block-behaviors';
import { redstoneConductivity } from '@jsprismarine/blocks';
import { bedrockBlockStates, javaBlockStates } from '@jsprismarine/mapping';
import type { BlockPosition, BlockRef, ExplosionWorld } from '@jsprismarine/engine-systems';
import { AIR } from '@jsprismarine/engine-systems';

import { worldBlockEntities } from './contentAdapter';
import { maxY } from './Dimension';
import type { World } from './World';
import type { WorldSystemsAccess } from './WorldSystems';

/**
 * Builds the engine and explosion world views over one {@link World}.
 *
 * @returns The redstone and random tick world view, plus the narrower explosion view.
 * @example
 * ```typescript
 * const systems = new WorldSystems({ view, world: createEngineWorld(world) });
 * ```
 */
export const createEngineWorld = (world: World): WorldSystemsAccess & ExplosionWorld => {
    /**
     * The chunk's own block entities, which store comparator output and container contents.
     *
     * A chunk saves its block entities with itself and sends them to every client that loads
     * it, so what goes in here is on disk at the next save and back in the record at the next
     * start. The comparator reads the record's stored output; container output is derived from
     * its contents each time.
     */
    const blockEntities = worldBlockEntities(() => world);

    const dimension = world.getDimension();

    const readBlock = (at: BlockPosition): BlockRef => {
        const block = world.loadedBlockAt(at.x, at.y, at.z);
        if (block === undefined) return AIR;

        const conductivity = world
            .getServer()
            .getContent()
            .blocks.types.get(block.name)
            ?.state(block.states)
            .content.params(redstoneConductivity);

        return {
            name: block.name,
            states: javaBlockStates(block.name, block.states),
            ...(conductivity === undefined ? {} : { redstoneConductor: conductivity.redstoneConductor })
        };
    };

    /**
     * Writes a block, and runs the updates it causes when the caller asks for them.
     *
     * A write into an unloaded chunk is refused rather than queued. The system that tried
     * reads air back on its next tick and tries again, which is a few wasted reads at the
     * edge of the loaded world and never a generated chunk.
     */
    const writeBlock = (at: BlockPosition, to: BlockRef, notifyNeighbors: boolean): void => {
        const states = bedrockBlockStates(to.name, to.states);
        world.setLoadedBlockState(at.x, at.y, at.z, { name: to.name, states }, notifyNeighbors);
    };

    return {
        getBlock: readBlock,
        setBlock: writeBlock,

        /**
         * The two numbers a comparator reads, out of the block entity standing there.
         *
         * `analogOutput` is Java's `Block.getAnalogOutputSignal`, which for every container is
         * `AbstractContainerMenu.getRedstoneSignalFromContainer` over what it holds. The
         * container family already computes that from the record's own slots, so a comparator
         * behind a chest reads the chest rather than a number somebody had to remember to
         * write. `comparatorOutput` is `ComparatorBlockEntity.outputSignal`, which only the
         * comparator writes.
         */
        getBlockEntityData: (at) => {
            const record = blockEntities.at(at);
            if (record === undefined) return undefined;

            const comparatorOutput = typeof record.comparatorOutput === 'number' ? record.comparatorOutput : undefined;
            const analogOutput = record.items === undefined ? undefined : containerSignal(record);
            if (comparatorOutput === undefined && analogOutput === undefined) return undefined;

            return { analogOutput, comparatorOutput };
        },

        randomInt: (bound) => Math.floor(Math.random() * bound),
        randomFloat: () => Math.random(),

        getMinY: () => dimension.minY,
        getMaxY: () => maxY(dimension)
    };
};
