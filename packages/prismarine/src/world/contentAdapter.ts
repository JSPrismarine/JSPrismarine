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
import { bedrockBiomeToJava } from '@jsprismarine/mapping';
import type { Definition } from '@jsprismarine/packs';
import type { RandomSource } from '@jsprismarine/predicates';

import { applyBlockEntityRecord, blockEntityCompound, blockEntityRecord } from '../blockentity/contentRecord';
import { writeBlockEntity } from '../blockentity/blockEntityWrite';
import { parseBiomeTags } from '../content/biomeTags';
import type { BiomeTagIndex } from '../content/biomeTags';
import { gameRuleValue } from '../content/world/gameRules';
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
import { destroyBlock } from './blockDestroy';
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

/**
 * The little of the built content these groups read.
 *
 * `ServerContent` satisfies it; this names only the registry `blocks.biomeTags` reads, so the
 * world subsystem does not take a dependency on the whole content build to answer one question
 * and a test does not have to build a pack stack to drive it.
 */
export interface WorldContentBiomes {
    /** Bedrock's biome definitions by identifier, whose `minecraft:tags` are the biome's tags. */
    readonly biomes: Iterable<readonly [string, Definition]>;
}

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
    /** The built content, read at call time; `blocks.biomeTags` reads its `biomes` registry. */
    readonly content: () => WorldContentBiomes;
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

    /**
     * The Bedrock biome at a position, or undefined when its chunk is not loaded.
     *
     * A chunk stores the number the client knows the biome by rather than a name, so the name
     * comes from `@jsprismarine/mapping`'s generated inverse. One of Bedrock's legacy biomes
     * is still a biome here: the inverse reports it as a loss because Java has no name for it,
     * and the Bedrock identifier - which is what this server deals in - comes back either way.
     * A number the pinned Bedrock data does not list is one nothing in this server wrote, and
     * there is no name to give it.
     */
    const biomeAt = (at: ContentPosition): string | undefined => {
        const chunk = live().getLoadedChunk(at.x >> 4, at.z >> 4);
        if (chunk === null) return undefined;

        const biome = bedrockBiomeToJava(chunk.getBiome(at.x, at.y, at.z));
        return biome.kind === 'unknown' ? undefined : biome.bedrock.identifier;
    };

    // Parsed once per content build rather than per lookup: a spawn pass asks for the tags of
    // every candidate position, and the pack stack's biome definitions do not change under it.
    let indexed: { content: WorldContentBiomes; tags: BiomeTagIndex } | undefined;
    const biomeTags = (): BiomeTagIndex => {
        const content = options.content();
        if (indexed?.content !== content) indexed = { content, tags: parseBiomeTags(content.biomes) };
        return indexed.tags;
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
        },
        gameRule: (name) => gameRuleValue(live().getGameRuleManager(), name)
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
        biome: biomeAt,
        // Bedrock keeps a biome's tags in its own definition, so the answer is the tags of
        // whichever biome the chunk says the position is in. An unloaded chunk has no biome
        // and so no tags, which is what a spawn rule reads as every `has_biome_tag` failing.
        biomeTags: (at) => {
            const biome = biomeAt(at);
            return biome === undefined ? [] : (biomeTags().get(biome) ?? []);
        }
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
    },

    /**
     * The server's one destruction path, which a family reaches through
     * `WorldActions.destroyBlock`: `onBreak` runs and Java's table decides what falls.
     *
     * The write stays with the caller, so a piston popping a torch spills whatever the
     * torch's family was holding and then writes air over it. Nothing is awaited: every
     * caller is inside the world tick and the item entity is read by nobody this tick.
     */
    destroy: (position) => {
        const loaded = world();
        if (loaded === undefined) return false;

        destroyBlock({ world: loaded, position });
        return true;
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
            const live = world();
            const chunk = chunkAt(at);
            if (live === undefined || chunk === null) return;

            const nbt = blockEntityCompound(
                chunk.getBlockEntity(at.x, at.y, at.z),
                at,
                chunk.getBlock(at.x, at.y, at.z).name
            );
            applyBlockEntityRecord(nbt, data);

            // Not `chunk.setBlockEntity`: a write that reaches the chunk and nobody else is
            // invisible to every client already holding it. `writeBlockEntity` also drops the
            // write when it changes nothing, which is what keeps a comparator restating the
            // same signal every tick from costing a packet and a chunk re-serialization.
            writeBlockEntity(live, nbt);
        }
    };
};
