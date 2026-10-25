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
import { bedrockBlockStates, javaBlockStates } from '@jsprismarine/mapping';
import { DIFFICULTIES, DIMENSIONS } from '@jsprismarine/engine-systems';
import type { BlockEntityData, BlockPosition, BlockRef, Difficulty, Weather } from '@jsprismarine/engine-systems';
import { AIR, positionKey } from '@jsprismarine/engine-systems';

import { destroyBlock } from './blockDestroy';
import { maxY } from './Dimension';
import { takeBlockEntity } from './blockMove';
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

    /**
     * The states the engine carries that the Bedrock block has no room for.
     *
     * Bedrock keeps a piston's `extended` in a block entity behind the arm rather than in the
     * block state, and this server models no piston block entity, so the value is held here
     * between the write that set it and the read that wants it back - the same bargain the
     * comparator's output above makes, and for the same reason. It does not reach disk: a
     * piston forgets it is extended across a restart, and the arm block standing in front of
     * it is what a client sees either way.
     *
     * Keyed by position and checked against the identifier, so a block replaced by another
     * one does not inherit the old one's states.
     */
    const dropped = new Map<string, { name: string; states: BlockRef['states'] }>();

    const dimension = world.getDimension();

    const readBlock = (at: BlockPosition): BlockRef => {
        const block = world.loadedBlockAt(at.x, at.y, at.z);
        if (block === undefined) return AIR;

        const states = javaBlockStates(block.name, block.states);
        const kept = dropped.get(positionKey(at));
        return { name: block.name, states: kept?.name === block.name ? { ...states, ...kept.states } : states };
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

        const key = positionKey(at);
        const extra = Object.entries(to.states).filter(([state]) => !(state in states));
        if (extra.length === 0) dropped.delete(key);
        else dropped.set(key, { name: to.name, states: Object.fromEntries(extra) });

        world.setLoadedBlockState(at.x, at.y, at.z, { name: to.name, states }, notifyNeighbors);
    };

    return {
        getBlock: readBlock,
        setBlock: writeBlock,

        getBlockEntityData: (at) => blockEntities.get(positionKey(at)),
        setBlockEntityData: (at, data) => {
            blockEntities.set(positionKey(at), data);
        },

        /**
         * Takes a block out: its family gets `onBreak`, Java's table decides what falls, and
         * what stands in its place goes in afterwards.
         *
         * The hook runs before the write because a family reads the block entity it is about
         * to lose, which is what spills a chest a piston popped or a stream of water reached.
         * Nothing is awaited: every caller is a system running inside the world tick, and the
         * item entity it spawns is read by nobody this tick.
         */
        destroyBlock: (at, removal) => {
            destroyBlock({ world, position: at, dropsBlock: removal.drops });
            writeBlock(at, removal.replacement ?? AIR, removal.notifyNeighbors ?? true);
        },

        /**
         * Carries a block and its block entity one position, which is what a piston does.
         *
         * The block entity comes off before the write that would clear it and is filed at
         * the new position afterwards, so a pushed chest arrives with what it held.
         */
        moveBlock: (from, to) => {
            const moving = readBlock(from);
            const carried = takeBlockEntity(world, from);

            writeBlock(from, AIR, false);
            writeBlock(to, moving, false);
            carried?.(to);
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
