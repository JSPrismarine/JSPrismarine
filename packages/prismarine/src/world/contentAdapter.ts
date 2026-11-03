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
 * all, and a world unloaded at runtime would leave the adapter pointing at a dead one. A
 * dimension's bounds and sky light come from the live world's type, which its `Level`
 * resolved and which is the only place a custom type's bounds and id exist; before a world
 * loads they fall back to the vanilla table by name, and to the Overworld after that. The
 * seed comes from the configuration, which is where the world would have got it.
 */
import { isLiquid } from '@jsprismarine/block-behaviors';
import { DIFFICULTIES } from '@jsprismarine/engine-systems';
import { bedrockBiomeToJava } from '@jsprismarine/mapping';
import type { Definition } from '@jsprismarine/packs';
import type { RandomSource } from '@jsprismarine/predicates';

import { applyBlockEntityRecord, blockEntityCompound, blockEntityRecord } from '../blockentity/contentRecord';
import { writeBlockEntity } from '../blockentity/blockEntityWrite';
import { parseBiomeTags } from '../content/biomeTags';
import type { BiomeTagIndex } from '../content/biomeTags';
import type { ContentTags } from '../content/tags';
import { gameRuleValue } from '../content/world/gameRules';
import type {
    ContentBlockAccess,
    ContentLevelFacts,
    ContentPosition,
    ContentTickScheduler,
    Difficulty
} from '../content/world/adapter';
import type { BlockEntityStore, BlockStorageAccess } from '../block/contentAdapter';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import type { BlockStateValue } from '../block/state/BlockState';
import { destroyBlock } from './blockDestroy';
import { takeBlockEntity } from './blockMove';
import { timeOfDay } from './DayCycle';
import { Dimensions, dimensionByName, maxY } from './Dimension';
import type { DimensionType } from './Dimension';
import type { World } from './World';

/** The six members of `ContentBlockAccess` the world subsystem implements. */
export type WorldBlockGroup = Pick<
    ContentBlockAccess,
    'light' | 'skyLight' | 'isLoaded' | 'surfaceY' | 'biome' | 'biomeTags'
>;

/** The four groups of `ServerWorldAdapter` the world subsystem owns. */
export interface WorldContentGroups {
    readonly level: ContentLevelFacts;
    readonly blocks: WorldBlockGroup;
    readonly ticks: ContentTickScheduler;
    readonly random: RandomSource;
}

/** The live world for one dimension, or undefined when none is loaded. */
export type LiveWorld = () => World | undefined;

/** As much of a `BlockType` as the spawn floor reads: the dense id one of its states carries. */
export interface SpawnFloorBlockType {
    state(values?: Readonly<Record<string, BlockStateValue>>): { readonly runtimeId: number };
}

/**
 * The little of the built content these groups read.
 *
 * `ServerContent` satisfies it; this names only what `blocks.biomeTags` and `blocks.surfaceY`
 * ask of it, so the world subsystem does not take a dependency on the whole content build to
 * answer two questions and a test does not have to build a pack stack to drive it.
 */
export interface WorldContentFacts {
    /** Bedrock's biome definitions by identifier, whose `minecraft:tags` are the biome's tags. */
    readonly biomes: Iterable<readonly [string, Definition]>;
    /** The resolved block types and their flattened columns, which `blocks.surfaceY` reads. */
    readonly blocks: {
        /** One resolved type per block identifier, read for the dense id of a placed state. */
        readonly types: ReadonlyMap<string, SpawnFloorBlockType>;
        /** The flattened columns; `solid` holds 1 for a block an entity may stand on. */
        readonly table: { readonly solid: ArrayLike<number> };
    };
    /** The merged tag stack, which `blocks.surfaceY` asks whether a block is leaves. */
    readonly tags: Pick<ContentTags, 'includes'>;
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
    /** The built content, read at call time; see {@link WorldContentFacts} for what of it. */
    readonly content: () => WorldContentFacts;
}

/** The difficulty name for the protocol's number, which counts peaceful through hard. */
export const contentDifficulty = (difficulty: number): Difficulty => DIFFICULTIES[difficulty] ?? 'normal';

/** The block tag Java's spawn heightmap skips, so that nothing spawns on a treetop. */
const LEAVES_TAG = 'minecraft:leaves';

/**
 * Whether a block is the floor of its column for spawning: Java's
 * `Heightmap.Types.MOTION_BLOCKING_NO_LEAVES`, which is what `SpawnPlacements` reads for every
 * mob that spawns on the ground.
 *
 * Three kinds of block are not that floor. Air is the obvious one. The plants, carpets and
 * snow layers standing on the ground carry no collision box, and a mob spawned in one stands
 * on the ground underneath it, which is the block a `minecraft:spawns_on_block_filter` names.
 * Leaves do have a collision box, and Java leaves them out by name so that a forest spawns
 * animals on its floor rather than on its canopy.
 *
 * A liquid counts, because a column of water is a column a fish spawns in rather than one
 * whose bed it sinks to.
 */
const holdsUpASpawn = (
    content: WorldContentFacts,
    identifier: string,
    states: Readonly<Record<string, BlockStateValue>>
): boolean => {
    if (content.tags.includes('block', LEAVES_TAG, identifier)) return false;
    if (isLiquid(identifier)) return true;

    const type = content.blocks.types.get(identifier);
    if (type === undefined) return false;
    return content.blocks.table.solid[type.state(states).runtimeId] === 1;
};

/**
 * Builds the world's four groups for one dimension.
 *
 * @throws {Error} From any member, when no world of that dimension is loaded. A content
 *   package asking the world a question before there is one is a wiring mistake, and
 *   answering it with a plausible number would hide that.
 */
export const worldContentGroups = (options: WorldContentGroupOptions): WorldContentGroups => {
    const { dimension, seed, random } = options;

    const live = (): World => {
        const world = options.world();
        if (world === undefined) throw new Error(`no ${dimension} world is loaded, so it cannot be read or written`);
        return world;
    };

    /**
     * The dimension type behind the bounds and the sky light. The live world's, because the
     * level resolved it and a custom type is known nowhere else; the vanilla table answers a
     * vanilla name before that world loads, and the Overworld answers anything else.
     */
    const type = (): DimensionType =>
        options.world()?.getDimension() ?? dimensionByName(dimension) ?? Dimensions.Overworld;

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
    let indexed: { content: WorldContentFacts; tags: BiomeTagIndex } | undefined;
    const biomeTags = (): BiomeTagIndex => {
        const content = options.content();
        if (indexed?.content !== content) indexed = { content, tags: parseBiomeTags(content.biomes) };
        return indexed.tags;
    };

    const level: ContentLevelFacts = {
        dimension,
        // Accessors, like `seaLevel` below: the interface spells them as properties, and the
        // type they read is the live world's.
        get minY() {
            return type().minY;
        },
        // One past the highest block y, which is how every content package bounds a column.
        get maxY() {
            return maxY(type()) + 1;
        },
        get hasSkyLight() {
            return type().java.hasSkylight;
        },
        get hasFixedTime() {
            return type().java.hasFixedTime;
        },
        get ambientLight() {
            return type().java.ambientLight;
        },
        get skyLightFactor() {
            const factor = type().java.attributes.get('minecraft:visual/sky_light_factor');
            return typeof factor === 'number' ? factor : type().java.hasSkylight ? 1 : 0;
        },
        // A property rather than a method, because the adapter interface spells it as one;
        // an accessor so it is read from the live world, whose stem says what the water line
        // is, rather than fixed before any world exists.
        get seaLevel() {
            return live().getSeaLevel();
        },
        seed,
        gameTime: () => live().getTicks(),
        dayTime: () => timeOfDay(live().getTicks()),
        difficulty: () => contentDifficulty(options.difficulty()),
        weather: () => live().getWeather(),
        isRainingAt: (at) => live().isRainingAt(at.x, at.y, at.z),
        spawnPosition: () => {
            const spawn = live().getKnownSpawnPosition();
            if (spawn === null) throw new Error(`the ${dimension} world has not found its spawn point yet`);
            return { x: spawn.getX(), y: spawn.getY(), z: spawn.getZ() };
        },
        gameRule: (name) => gameRuleValue(live().getGameRuleManager(), name)
    };

    const blocks: WorldBlockGroup = {
        // Preserve dimension ambient light and the visual sky-light factor when the data-driven
        // rules ask for brightness. The End and Nether suppress sky light, but their ambient
        // floors keep the dimension from reading as pitch black.
        light: (at) => {
            const lighting = live().getSystems().lighting;
            const ambientLight = Math.floor((level.ambientLight ?? 0) * 15);
            const skyLight = Math.floor(
                lighting.getSkyLight(at.x, at.y, at.z) * (level.skyLightFactor ?? (level.hasSkyLight ? 1 : 0))
            );
            return Math.max(lighting.getBlockLight(at.x, at.y, at.z), skyLight, ambientLight);
        },
        skyLight: (at) => live().getSystems().lighting.getSkyLight(at.x, at.y, at.z),
        isLoaded: (at) => live().getLoadedChunk(at.x >> 4, at.z >> 4) !== null,
        surfaceY: (x, z) => {
            const chunk = live().getLoadedChunk(x >> 4, z >> 4);
            if (chunk === null) return undefined;

            const highest = chunk.getHighestBlockAt(x & 0xf, z & 0xf);
            if (highest === null) return undefined;

            // Down from there rather than straight off it: the highest block that is not air
            // is the canopy over a forest and the grass standing on a plain, and an entity
            // stands on neither. An empty column has nothing to stand on.
            const built = options.content();
            for (let y = highest; y >= type().minY; y -= 1) {
                const block = chunk.getBlock(x & 0xf, y, z & 0xf);
                if (holdsUpASpawn(built, block.name, block.properties)) return y + 1;
            }

            return undefined;
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
    move: (from, to) => {
        const live = world();
        if (live === undefined || live.loadedBlockAt(to.x, to.y, to.z) === undefined) return;

        const moving = live.loadedBlockAt(from.x, from.y, from.z);
        if (moving === undefined) return;

        const movingRuntimeId = BlockRuntimeIds.tryGetByState(moving.name, moving.states);
        const airRuntimeId = BlockRuntimeIds.tryGetByState('minecraft:air', {});
        if (movingRuntimeId === null || airRuntimeId === null) {
            throw new Error(
                `this server's block catalog cannot move ${moving.name} at ${from.x}, ${from.y}, ${from.z}`
            );
        }

        const placeBlockEntity = takeBlockEntity(live, from);
        if (!live.setLoadedBlockRuntimeId(from.x, from.y, from.z, airRuntimeId, undefined, 1, false)) return;
        if (!live.setLoadedBlockRuntimeId(to.x, to.y, to.z, movingRuntimeId, undefined, 1, false)) return;
        placeBlockEntity?.(to);
    },

    /**
     * The server's one destruction path, which a family reaches through
     * `WorldActions.destroyBlock`: `onBreak` runs and Java's table decides what falls.
     *
     * The write stays with the caller, so a piston popping a torch spills whatever the
     * torch's family was holding and then writes air over it. Nothing is awaited: every
     * caller is inside the world tick and the item entity is read by nobody this tick.
     */
    destroy: (position, options) => {
        const loaded = world();
        if (loaded === undefined) return false;

        destroyBlock({ world: loaded, position, dropsBlock: options?.drops ?? true });
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
