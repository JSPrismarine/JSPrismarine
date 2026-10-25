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
import { containerSignal } from '@jsprismarine/block-behaviors';
import { bedrockBlockStates, javaBlockStates } from '@jsprismarine/mapping';
import { DIFFICULTIES, DIMENSIONS } from '@jsprismarine/engine-systems';
import type { BlockPosition, BlockRef, Difficulty } from '@jsprismarine/engine-systems';
import { AIR } from '@jsprismarine/engine-systems';
import { Gametype } from '@jsprismarine/minecraft';

import {
    FIRE_SPREAD_RADIUS,
    UNLIMITED_FIRE_SPREAD_RADIUS,
    fireSpreadRadius,
    gameRuleValue
} from '../content/world/gameRules';
import type { GameRuleStore } from '../content/world/gameRules';
import { destroyBlock } from './blockDestroy';
import { worldBlockEntities } from './contentAdapter';
import { maxY } from './Dimension';
import { takeBlockEntity } from './blockMove';
import type { World } from './World';
import type { WorldSystemsAccess } from './WorldSystems';

/** The block entity field the engine's own block states are kept under. */
const ENGINE_STATES_FIELD = 'engineStates';

/**
 * The blocks the engine carries a state for that the Bedrock palette has no room for.
 *
 * One case: a piston's `extended_bit`, which Java holds in the block state and Bedrock holds
 * nowhere, because it draws an extended piston from the arm block in front of it instead. The
 * engine needs the flag back on its next tick to know whether to extend or retract, so it goes
 * into the block entity, and from there to disk.
 *
 * Named rather than discovered, because {@link createEngineWorld}'s block read is the hottest
 * call the engine makes - every fluid, fire and redstone tick is several of them - and a chunk
 * block entity lookup per read would cost more than every system it serves. A name is added
 * when a write turns up a state nothing predicted, so a new one is slow for the rest of the
 * session rather than silently lost; after a restart only the names listed here are read back.
 */
const CARRIES_ENGINE_STATES = new Set<string>(['minecraft:piston', 'minecraft:sticky_piston']);

/** Whether a field read back out of a block entity is a state record rather than something else. */
const isStates = (value: unknown): value is BlockRef['states'] =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** The difficulty name for the protocol's number, which counts peaceful through hard. */
const difficultyName = (difficulty: number): Difficulty => DIFFICULTIES[difficulty] ?? 'normal';

/** The little of a player Java's `ChunkMap.playerIsCloseEnoughTo` reads. */
export interface FireWatcher {
    getPosition(): { getX(): number; getY(): number; getZ(): number };
    /** Their gamemode: a spectator keeps no fire alive. */
    readonly gamemode: number;
}

/** The two things {@link canSpreadFireAround} asks a world: its rules and who is in it. */
export interface FireSpreadWorld {
    getGameRuleManager(): GameRuleStore | null;
    getPlayers(): readonly FireWatcher[];
}

/**
 * Java's `ServerLevel.canSpreadFireAround`: whether fire at a position does anything on its
 * tick beyond booking the next one.
 *
 * `minecraft:fire_spread_radius_around_player` is an integer since 1.21.11, so the answer is
 * how far the nearest player is rather than a flag. -1 lifts the limit; anything else is
 * `ChunkMap.anyPlayerCloseEnoughTo`, which is a euclidean distance from the block's lower
 * corner, strictly inside the radius, with spectators left out. A radius of 0 therefore stops
 * every fire in the world, which is what the old `doFireTick` off became.
 *
 * The radius is checked per fire tick and costs one pass over the player list. Nothing here
 * runs for a chunk that holds no fire, because nothing books a fire tick for one.
 */
export const canSpreadFireAround = (world: FireSpreadWorld, at: BlockPosition): boolean => {
    const radius = fireSpreadRadius(gameRuleValue(world.getGameRuleManager(), FIRE_SPREAD_RADIUS));
    if (radius === UNLIMITED_FIRE_SPREAD_RADIUS) return true;

    return world.getPlayers().some((player) => {
        if (player.gamemode === Gametype.SPECTATOR) return false;

        const position = player.getPosition();
        const dx = position.getX() - at.x;
        const dy = position.getY() - at.y;
        const dz = position.getZ() - at.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) < radius;
    });
};

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
     * The chunk's own block entities, which is where both halves of the engine's record live.
     *
     * A chunk saves its block entities with itself and sends them to every client that loads
     * it, so what goes in here is on disk at the next save and back in the record at the next
     * start. That is what a comparator's remembered output and a piston's `extended` both
     * need: Java keeps the first in `ComparatorBlockEntity.outputSignal` and the second in a
     * block state, and neither has anywhere else to go on Bedrock.
     */
    const blockEntities = worldBlockEntities(() => world);

    const dimension = world.getDimension();

    const readBlock = (at: BlockPosition): BlockRef => {
        const block = world.loadedBlockAt(at.x, at.y, at.z);
        if (block === undefined) return AIR;

        const states = javaBlockStates(block.name, block.states);
        if (!CARRIES_ENGINE_STATES.has(block.name)) return { name: block.name, states };

        const kept = blockEntities.at(at)?.[ENGINE_STATES_FIELD];
        return { name: block.name, states: isStates(kept) ? { ...states, ...kept } : states };
    };

    /**
     * Writes a block, and runs the updates it causes when the caller asks for them.
     *
     * A write into an unloaded chunk is refused rather than queued. The system that tried
     * reads air back on its next tick and tries again, which is a few wasted reads at the
     * edge of the loaded world and never a generated chunk.
     *
     * A state the Bedrock palette has no room for goes into the block entity rather than
     * being dropped - see {@link CARRIES_ENGINE_STATES}.
     */
    const writeBlock = (at: BlockPosition, to: BlockRef, notifyNeighbors: boolean): void => {
        const states = bedrockBlockStates(to.name, to.states);

        const extra = Object.entries(to.states).filter(([state]) => !(state in states));
        if (extra.length > 0) {
            CARRIES_ENGINE_STATES.add(to.name);
            blockEntities.put(at, { ...blockEntities.at(at), [ENGINE_STATES_FIELD]: Object.fromEntries(extra) });
        } else if (CARRIES_ENGINE_STATES.has(to.name)) {
            const held = blockEntities.at(at);
            if (held?.[ENGINE_STATES_FIELD] !== undefined) {
                blockEntities.put(at, { ...held, [ENGINE_STATES_FIELD]: undefined });
            }
        }

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

        /**
         * Keeps what a comparator remembered.
         *
         * Only `comparatorOutput` is written back. `analogOutput` is derived from the
         * container's own slots on every read, so storing it would be a second copy of the
         * chest's contents that nothing keeps in step with them.
         */
        setBlockEntityData: (at, data) => {
            blockEntities.put(at, { ...blockEntities.at(at), comparatorOutput: data.comparatorOutput });
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
        getWeather: () => world.getWeather(),
        isRainingAt: (at) => world.isRainingAt(at.x, at.y, at.z),

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
