/**
 * The world subsystem's slice of `ServerWorldAdapter`, over one live {@link World}.
 *
 * `src/content/world/adapter.ts` is one interface with eleven groups split four ways. This
 * module owns the world's share: what a dimension is and what its clock says, the five block
 * reads that come out of chunks rather than out of the palette, the two scheduled tick lists,
 * and the random draws. Blocks and items own the other six block members; entities own three
 * groups of their own.
 *
 * Every member resolves the world at call time rather than holding one. The content is built
 * before the first world loads, so an adapter that captured a world could not be built at
 * all, and a world unloaded at runtime would leave the adapter pointing at a dead one. The
 * handful of facts that cannot be deferred - a dimension's bounds and its seed - come from
 * the dimension identifier and the configured seed instead, which is where the world would
 * have got them.
 */
import { DIFFICULTIES } from '@jsprismarine/engine-systems';
import type { RandomSource } from '@jsprismarine/predicates';

import { applyBlockEntityRecord, blockEntityCompound, blockEntityRecord } from '../blockentity/contentRecord';
import { BlockEntityRegistry } from '../blockentity/BlockEntityRegistry';
import { CONTENT_AREAS, notWired } from '../content/world/notWired';
import type {
    ContentBlockAccess,
    ContentLevelFacts,
    ContentPosition,
    ContentTickScheduler,
    Difficulty,
    Weather
} from '../content/world/adapter';
import type { BlockEntityStore, BlockStorageAccess } from '../block/contentAdapter';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { timeOfDay } from './DayCycle';
import { Dimensions, maxY } from './Dimension';
import type { DimensionDefinition } from './Dimension';
import type { World } from './World';

/** The five members of `ContentBlockAccess` the world subsystem implements. */
export type WorldBlockGroup = Pick<ContentBlockAccess, 'light' | 'isLoaded' | 'surfaceY' | 'biome' | 'biomeTags'>;

/** The four groups of `ServerWorldAdapter` the world subsystem owns. */
export interface WorldContentGroups {
    readonly level: ContentLevelFacts;
    readonly blocks: WorldBlockGroup;
    readonly ticks: ContentTickScheduler;
    readonly random: RandomSource;
}

/** The live world for one dimension, or undefined when none is loaded. */
export type LiveWorld = () => World | undefined;

/** What {@link worldContentGroups} is built over. */
export interface WorldContentGroupOptions {
    /** The namespaced dimension identifier these groups answer for. */
    readonly dimension: string;
    /** The live world, read at call time; see this module's header. */
    readonly world: LiveWorld;
    /** The world seed, which `level.seed` reports. */
    readonly seed: bigint;
    /** The configured difficulty, as the protocol numbers it. */
    difficulty(): number;
    /** Where every chance a content package rolls comes from, so a test can seed it. */
    readonly random: RandomSource;
}

/** The dimension definitions by their namespaced identifier. */
const DIMENSION_DEFINITIONS: Readonly<Record<string, DimensionDefinition>> = {
    'minecraft:overworld': Dimensions.Overworld,
    'minecraft:nether': Dimensions.Nether,
    'minecraft:the_end': Dimensions.TheEnd
};

/**
 * The sea level of each dimension, from the `sea_level` of Java 26.3's three noise settings.
 *
 * Worldgen's `relative_to_sea_level` anchors resolve against it, and the overworld's 63 is
 * also the water line every surface rule is written around.
 */
const SEA_LEVELS: Readonly<Record<string, number>> = {
    'minecraft:overworld': 63,
    'minecraft:nether': 32,
    'minecraft:the_end': 0
};

/**
 * The weather the content packages read.
 *
 * This server runs no weather cycle: nothing raises rain or thunder and no client is ever
 * sent any, so clear is the fact rather than a default. `EngineWorld` answers the same way
 * for the same reason.
 */
const WEATHER_WITHOUT_A_CYCLE: Weather = 'clear';

/** The difficulty name for the protocol's number, which counts peaceful through hard. */
export const contentDifficulty = (difficulty: number): Difficulty => DIFFICULTIES[difficulty] ?? 'normal';

/**
 * Builds the world's four groups for one dimension.
 *
 * @throws {Error} From any member, when no world of that dimension is loaded. A content
 *   package asking the world a question before there is one is a wiring mistake, and
 *   answering it with a plausible number would hide that.
 */
export const worldContentGroups = (options: WorldContentGroupOptions): WorldContentGroups => {
    const { dimension, seed, random } = options;
    const definition = DIMENSION_DEFINITIONS[dimension] ?? Dimensions.Overworld;

    const live = (): World => {
        const world = options.world();
        if (world === undefined) throw new Error(`no ${dimension} world is loaded, so it cannot be read or written`);
        return world;
    };

    const level: ContentLevelFacts = {
        dimension,
        minY: definition.minY,
        // One past the highest block y, which is how every content package bounds a column.
        maxY: maxY(definition) + 1,
        hasSkyLight: definition.id === Dimensions.Overworld.id,
        seaLevel: SEA_LEVELS[dimension] ?? SEA_LEVELS['minecraft:overworld']!,
        seed,
        gameTime: () => live().getTicks(),
        dayTime: () => timeOfDay(live().getTicks()),
        difficulty: () => contentDifficulty(options.difficulty()),
        weather: () => WEATHER_WITHOUT_A_CYCLE,
        isRainingAt: () => false,
        spawnPosition: () => {
            const spawn = live().getKnownSpawnPosition();
            if (spawn === null) throw new Error(`the ${dimension} world has not found its spawn point yet`);
            return { x: spawn.getX(), y: spawn.getY(), z: spawn.getZ() };
        }
    };

    const blocks: WorldBlockGroup = {
        // Java's `getRawBrightness`, less the sky darkening this server does not track: the
        // growth, melt and spawn rules read whichever of the two is brighter.
        light: (at) => {
            const lighting = live().getSystems().lighting;
            return Math.max(lighting.getBlockLight(at.x, at.y, at.z), lighting.getSkyLight(at.x, at.y, at.z));
        },
        isLoaded: (at) => live().getLoadedChunk(at.x >> 4, at.z >> 4) !== null,
        surfaceY: (x, z) => {
            const chunk = live().getLoadedChunk(x >> 4, z >> 4);
            if (chunk === null) return undefined;

            // The adapter wants the lowest y an entity may stand on, which is one above the
            // highest block that is not air. An empty column has nothing to stand on.
            const highest = chunk.getHighestBlockAt(x & 0xf, z & 0xf);
            return highest === null ? undefined : highest + 1;
        },
        // A chunk stores a numeric Bedrock biome id, and nothing maps those back to
        // identifiers: `@jsprismarine/mapping` maps Java identifiers to Bedrock ones, in that
        // direction only. Guessing would make a spawn rule's `is_biome` match the wrong
        // biome everywhere rather than refuse.
        biome: notWired('blocks.biome', CONTENT_AREAS.world),
        // Bedrock keeps biome tags in the biome definitions of the pack stack, which nothing
        // parses yet, so `has_biome_tag` has no table to read.
        biomeTags: notWired('blocks.biomeTags', CONTENT_AREAS.world)
    };

    const ticks: ContentTickScheduler = {
        schedule: (kind, at, type, delay, priority) => {
            const world = live();
            // At least one tick out, which is what the interface promises and what keeps a
            // tick scheduled during a drain from landing in the batch being drained.
            world
                .getSystems()
                .ticks.list(kind)
                .schedule(at, type, world.getTicks() + Math.max(1, delay), priority);
        },
        isScheduled: (kind, at, type) => live().getSystems().ticks.list(kind).hasScheduledTick(at, type),
        runsThisTick: (kind, at, type) => live().getSystems().ticks.list(kind).willTickThisTick(at, type)
    };

    return { level, blocks, ticks, random };
};

/**
 * The chunk storage the block group reads and writes, for one live world.
 *
 * Both members are synchronous and touch only chunks in memory. A behavior runs inside the
 * tick and cannot wait for a chunk, and pulling terrain into existence because a block looked
 * at its neighbor would generate the world outwards one update at a time.
 *
 * @param world - The live world, read at call time.
 */
export const worldBlockStorage = (world: LiveWorld): BlockStorageAccess => ({
    at: (position) => {
        const block = world()?.loadedBlockAt(position.x, position.y, position.z);
        return block && { identifier: block.name, states: block.states };
    },
    write: (position, block) => {
        const runtimeId = BlockRuntimeIds.tryGetByState(block.identifier, block.states);
        if (runtimeId === null) {
            throw new Error(
                `this server's block catalog has no ${block.identifier} in state ${JSON.stringify(block.states)}`
            );
        }

        // Written bare: `createContentBlockGroup` raises `onPlace` and notifies the neighbors
        // itself, and a world that did either here would do it twice.
        world()?.setLoadedBlockRuntimeId(position.x, position.y, position.z, runtimeId, undefined, 1, false);
    }
});

/**
 * Where the content block entity records of one world live: in the chunks, as block entities.
 *
 * A chunk already holds Bedrock's block entities, saves them with itself and sends them to every
 * client that loads it, so a record written here is on disk at the next save and back in the
 * record at the next start. {@link import('../blockentity/contentRecord')} states the mapping
 * between the two shapes.
 *
 * Both members are synchronous and touch only chunks in memory, for the reason
 * {@link worldBlockStorage} is: a behavior runs inside the tick. A write into an unloaded chunk
 * is dropped rather than awaited, which is the same answer `blocks.get` gives there.
 *
 * @param world - The live world, read at call time.
 */
export const worldBlockEntities = (world: LiveWorld): BlockEntityStore => {
    const chunkAt = (at: ContentPosition) => world()?.getLoadedChunk(at.x >> 4, at.z >> 4) ?? null;

    return {
        at: (at) => {
            const existing = chunkAt(at)?.getBlockEntity(at.x, at.y, at.z);
            return existing ? blockEntityRecord(existing.toNBT()) : undefined;
        },
        put: (at, data) => {
            const chunk = chunkAt(at);
            if (chunk === null) return;

            const nbt = blockEntityCompound(
                chunk.getBlockEntity(at.x, at.y, at.z),
                at,
                chunk.getBlock(at.x, at.y, at.z).name
            );
            applyBlockEntityRecord(nbt, data);
            chunk.setBlockEntity(BlockEntityRegistry.fromNBT(nbt));
        }
    };
};
