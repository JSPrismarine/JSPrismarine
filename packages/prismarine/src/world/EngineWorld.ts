/**
 * The world `@jsprismarine/engine-systems` reads and writes, over this server's chunks.
 *
 * Redstone, fluids and fire never see a chunk, a palette or a player. They see one
 * `WorldAccess`, and this builds it out of the handful of things a {@link World} already
 * does. Everything here is synchronous and reads only chunks in memory, because a scheduled
 * tick runs inside the world tick and must not wait for a chunk, nor pull terrain into
 * existence by flowing water at the edge of the loaded world.
 *
 * The engine spells a block's states Java's way - `facing_direction` holds a direction word
 * where Bedrock holds a number, and the number is per block - so every block is translated on
 * the way in and back on the way out, through `@jsprismarine/mapping`, which is the one place
 * allowed to know that two editions exist. Without it a piston arm came out as a state this
 * palette does not hold and the write was declined, so pistons never extended.
 */
import { Vector3 } from '@jsprismarine/math';
import { DIFFICULTIES, DIMENSIONS } from '@jsprismarine/engine-systems';
import type { BlockEntityData, BlockPosition, BlockRef, Difficulty, Weather } from '@jsprismarine/engine-systems';
import { AIR, positionKey } from '@jsprismarine/engine-systems';

import { maxY } from './Dimension';
import type { World } from './World';
import type { WorldSystemsAccess } from './WorldSystems';

/**
 * The weather the engine reads.
 *
 * This server has no weather cycle, so fire never drowns in the rain and a fluid never
 * reacts to one. Clear is the honest answer until something drives the cycle.
 */
const WEATHER_WITHOUT_A_CYCLE: Weather = 'clear';

/** The difficulty name for the protocol's number, which counts peaceful through hard. */
const difficultyName = (difficulty: number): Difficulty => DIFFICULTIES[difficulty] ?? 'normal';

/** Where a sound or a drop goes: the middle of the block, not its corner. */
const centerOf = (at: BlockPosition): Vector3 => new Vector3(at.x + 0.5, at.y + 0.5, at.z + 0.5);

/**
 * Builds the engine's world over one {@link World}.
 *
 * @returns Every `WorldAccess` member except the scheduling three, which
 *   {@link import('./WorldSystems').WorldSystems} fills from the tick lists it owns.
 * @example
 * ```typescript
 * const systems = new WorldSystems({ view, world: createEngineWorld(world) });
 * ```
 */
export const createEngineWorld = (world: World): WorldSystemsAccess => {
    /**
     * What a comparator remembers between ticks, which is Java's
     * `ComparatorBlockEntity.outputSignal`.
     *
     * Held here rather than in the chunk's block entities because those are NBT compounds
     * with no field for it, so it does not reach disk: a comparator forgets its last output
     * across a restart and recomputes it on its next tick. The other half of the record, the
     * container fill level a comparator reads out of a chest, stays undefined until the
     * block entity subsystem can answer it, so a comparator reading a container reads zero.
     */
    const blockEntities = new Map<string, BlockEntityData>();

    const dimension = world.getDimension();

    return {
        getBlock: (at): BlockRef => {
            const block = world.loadedBlockAt(at.x, at.y, at.z);
            return block === undefined ? AIR : { name: block.name, states: javaBlockStates(block.name, block.states) };
        },

        /**
         * Writes a block, and runs the updates it causes when the caller asks for them.
         *
         * A write into an unloaded chunk is refused rather than queued. The system that
         * tried reads air back on its next tick and tries again, which is a few wasted
         * reads at the edge of the loaded world and never a generated chunk.
         */
        setBlock: (at, to, notifyNeighbors) => {
            const states = bedrockBlockStates(to.name, to.states);
            world.setLoadedBlockState(at.x, at.y, at.z, { name: to.name, states }, notifyNeighbors);
        },

        getBlockEntityData: (at) => blockEntities.get(positionKey(at)),
        setBlockEntityData: (at, data) => {
            blockEntities.set(positionKey(at), data);
        },

        /**
         * Drops a block as an item, which is what a piston destroying what it pushed does.
         *
         * The drop is a block identifier, so it goes through the block registry and is lost
         * when nothing has registered that block. Awaiting it would make every system in the
         * engine asynchronous for a dropped stack nobody reads back.
         */
        spawnItem: (at, item) => {
            const block = world.getServer().getBlockManager().findBlock(item.identifier);
            if (block === null) return;

            const contents = Array.from({ length: item.count }, () => block);
            void world.dropContents(centerOf(at), contents).catch((error: unknown) => {
                world.getServer().getLogger().error(error);
            });
        },

        // The engine names a sound with its namespace and a Bedrock client looks one up by
        // the bare name its sound definitions use, so the namespace comes off here.
        playSound: (at, sound) => world.playNamedSound(at.x, at.y, at.z, sound.replace(/^minecraft:/, '')),

        getDifficulty: () => difficultyName(world.getServer().getConfig().getDifficulty()),
        getWeather: () => WEATHER_WITHOUT_A_CYCLE,
        isRainingAt: () => false,

        // The protocol numbers the dimensions in the order the engine lists them, so the id
        // this server stores indexes that list rather than needing a table of its own.
        getDimension: () => DIMENSIONS[dimension.id] ?? 'overworld',
        getGameTime: () => world.getTicks(),

        randomInt: (bound) => Math.floor(Math.random() * bound),
        randomFloat: () => Math.random(),

        getMinY: () => dimension.minY,
        getMaxY: () => maxY(dimension)
    };
};
