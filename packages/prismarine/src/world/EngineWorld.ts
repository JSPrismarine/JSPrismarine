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
import { bedrockBlockStates } from '@jsprismarine/mapping';
import type { BlockPosition, BlockRef, ExplosionWorld } from '@jsprismarine/engine-systems';
import { AIR } from '@jsprismarine/engine-systems';

import { worldBlockEntities } from './contentAdapter';
import { createEngineBlockCache } from './EngineBlockCache';
import { maxY } from './Dimension';
import { takesRandomTicks } from './randomTickSections';
import { BlockStateSchemas } from '../block/state/BlockStateSchema';
import type { ReadonlyBlockStorage } from './chunk/BlockStorage';
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
    const blockCache = createEngineBlockCache(() => world.getServer().getContent());

    const dimension = world.getDimension();

    // One reader for every section's random tick draws, pointed at the next section by
    // `sectionRandomTickIds`: a tick asks for one per section of every simulated chunk, and a
    // closure each was most of what random ticks allocated.
    let tickStorage: ReadonlyBlockStorage | undefined;
    let tickFlags: Uint8Array = new Uint8Array(0);
    let ticks: (runtimeId: number) => boolean = () => false;
    // What each palette slot of a storage answered: 0 not asked yet, 1 no, 2 yes. A storage only
    // ever appends to its palette, so a slot names the same block for as long as the storage
    // lives, and a draw reads one byte where it used to look its hashed runtime id up in a map.
    // Dropped with the lookup it was filled from, which a content or block catalog change replaces.
    let flagsByStorage = new WeakMap<ReadonlyBlockStorage, Uint8Array>();
    let flagsLookup = ticks;
    let flagsRevision = -1;
    const readTickSection = (x: number, y: number, z: number): number | undefined => {
        const storage = tickStorage;
        if (storage === undefined) return undefined;
        const slot = storage.getPaletteIndexAt(x & 15, y & 15, z & 15);
        const runtimeId = storage.getPalette()[slot]!;
        const known = slot < tickFlags.length ? tickFlags[slot]! : 0;
        if (known !== 0) return known === 2 ? runtimeId : undefined;

        const ticking = ticks(runtimeId);
        if (slot >= tickFlags.length) {
            // A write earlier in this tick can append to the palette.
            const grown = new Uint8Array(storage.getPalette().length);
            grown.set(tickFlags);
            tickFlags = grown;
            flagsByStorage.set(storage, grown);
        }
        tickFlags[slot] = ticking ? 2 : 1;
        return ticking ? runtimeId : undefined;
    };

    const readBlock = (at: BlockPosition): BlockRef => {
        const runtimeId = world.loadedBlockRuntimeIdAt(at.x, at.y, at.z);
        return runtimeId === undefined ? AIR : blockCache.get(runtimeId).block;
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
        // Keep the position filter for existing callers while random ticks use the cached runtime-id path.
        isRandomlyTicking: (at) => {
            const runtimeId = world.loadedBlockRuntimeIdAt(at.x, at.y, at.z);
            return runtimeId !== undefined && takesRandomTicks(runtimeId);
        },
        getBlockRuntimeId: (at) => world.loadedBlockRuntimeIdAt(at.x, at.y, at.z),
        sectionRuntimeIds: (origin) => {
            const section = world.getLoadedChunk(origin.x >> 4, origin.z >> 4)?.getSubChunk(origin.y >> 4);
            if (section === null || section === undefined) return undefined;
            return (x, y, z) => section.getBlockRuntimeId(x & 15, y & 15, z & 15);
        },
        sectionRandomTickIds: (origin) => {
            const section = world.getLoadedChunk(origin.x >> 4, origin.z >> 4)?.getSubChunk(origin.y >> 4);
            if (section === null || section === undefined) return undefined;
            ticks = blockCache.randomTickingLookup();
            const revision = BlockStateSchemas.getRevision();
            if (ticks !== flagsLookup || revision !== flagsRevision) {
                flagsByStorage = new WeakMap();
                flagsLookup = ticks;
                flagsRevision = revision;
            }
            tickStorage = section.getBlockStorage(0);
            if (tickStorage === undefined) {
                tickFlags = new Uint8Array(0);
            } else {
                let flags = flagsByStorage.get(tickStorage);
                if (flags === undefined) {
                    flags = new Uint8Array(tickStorage.getPalette().length);
                    flagsByStorage.set(tickStorage, flags);
                }
                tickFlags = flags;
            }
            return readTickSection;
        },
        getBlockByRuntimeId: (runtimeId) => blockCache.get(runtimeId).block,
        isRandomlyTickingRuntimeId: (runtimeId) => blockCache.get(runtimeId).randomTicking,
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

        randomInt: (bound) => Math.floor(world.getServer().getRandom()() * bound),
        randomFloat: () => world.getServer().getRandom()(),

        getMinY: () => dimension.minY,
        getMaxY: () => maxY(dimension)
    };
};
