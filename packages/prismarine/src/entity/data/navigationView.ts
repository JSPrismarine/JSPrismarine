/**
 * The blocks as `@jsprismarine/entity-goals`'s path finder reads them.
 *
 * Every answer comes from the flattened block table rather than from a list of
 * block names: `solid` is the column the resolve computed for all 22079 palette
 * states, so a block this server has never heard of is still correctly solid
 * or not. The three liquids are named, because being water or lava is a fact
 * about those four identifiers and nothing else.
 */
import type { NavigationView } from '@jsprismarine/entity-goals';
import type { EntityPosition } from '@jsprismarine/entities';

import { BlockRuntimeIds } from '../../block/state/BlockRuntimeIds';
import type { ServerContent } from '../../content/ServerContent';
import type { ContentBlock, ContentBlockAccess, ContentLevelFacts } from '../../content/world/adapter';
import { isDay } from '../../world/DayCycle';

/** The two water identifiers, which a path finder treats as passable and a swim profile prefers. */
const WATER = new Set(['minecraft:water', 'minecraft:flowing_water']);

/** The two lava identifiers, which only a lava-walking profile enters. */
const LAVA = new Set(['minecraft:lava', 'minecraft:flowing_lava']);

/** Blocks that hurt anything standing in them, which `avoid_damage_blocks` steers around. */
const DAMAGING = new Set([
    'minecraft:lava',
    'minecraft:flowing_lava',
    'minecraft:fire',
    'minecraft:soul_fire',
    'minecraft:magma',
    'minecraft:cactus',
    'minecraft:sweet_berry_bush',
    'minecraft:wither_rose',
    'minecraft:powder_snow'
]);

/** Blocks an entity climbs rather than walks up. */
const CLIMBABLE = new Set(['minecraft:ladder', 'minecraft:vine', 'minecraft:scaffolding', 'minecraft:twisting_vines']);

/** The two portals, which `avoid_portals` steers around. */
const PORTALS = new Set(['minecraft:portal', 'minecraft:end_portal', 'minecraft:end_gateway']);

/** The maximum block cells the view retains across all loaded chunks. */
const MAX_CACHED_BLOCKS = 100_000;
/** Keeps sparse chunk caches bounded when a pathfinder roams a very large world. */
const MAX_CACHED_CHUNKS = 1_024;
const NO_BLOCK = Symbol('no loaded block');
const TICK_SCOPED_CHUNK = {};

type CachedBlock = ContentBlock | number | typeof NO_BLOCK;

interface CachedChunkBlocks {
    readonly x: number;
    readonly z: number;
    identity: object;
    revision: number;
    readonly cells: Map<number, CachedBlock>;
}

/** The path finder's block view and the cache control the owning runtime needs. */
export interface CachedNavigationView {
    readonly view: NavigationView;
    /** Whether loaded chunk identities and revisions make reads safe to retain between ticks. */
    readonly persistsAcrossTicks: boolean;
    /** Drops all cached reads, or just the reads for one changed or unloaded chunk. */
    invalidateBlockCache(chunkX?: number, chunkZ?: number): void;
}

/**
 * Builds the path finder's view of one dimension.
 *
 * Built once per runtime rather than per query, because the memo below is
 * what makes a path search affordable: one A* expands up to 512 nodes and
 * reads about eight cells at each, so a stroll that finds nothing costs four
 * thousand block reads, and a server runs one of those per wandering mob per
 * tick.
 *
 * @param blocks - Block state and lighting queries for the dimension.
 * @param content - The loaded content, for its block behavior table.
 * @param level - The dimension clock and sky settings; omitted by callers with no level view.
 * @param maxCachedBlocks - A smaller bound for deterministic eviction tests.
 */
export const navigationViewOf = (
    blocks: ContentBlockAccess,
    content: () => ServerContent,
    level?: ContentLevelFacts,
    maxCachedBlocks = MAX_CACHED_BLOCKS
): CachedNavigationView => {
    /** Cell answers are grouped by chunk so writes and unloads evict only one group. */
    const cachedBlocks = new Map<number, Map<number, CachedChunkBlocks>>();
    /** Map insertion order is the LRU order, with the most recently used chunk at the end. */
    const leastRecentlyUsed = new Map<CachedChunkBlocks, undefined>();
    let cachedBlockCount = 0;
    const cacheLimit = Math.max(0, Math.floor(maxCachedBlocks));
    const chunkLimit = Math.min(MAX_CACHED_CHUNKS, cacheLimit);
    const persistsAcrossTicks = blocks.blockChunkIdentityAt !== undefined && blocks.blockChunkRevisionAt !== undefined;
    let lastChunkX: number | undefined;
    let lastChunkZ: number | undefined;
    let lastChunk: CachedChunkBlocks | undefined;
    let mostRecentlyUsed: CachedChunkBlocks | undefined;
    /** Reuses a block identifier when adjacent water and lava checks ask about the same cell. */
    let hasLastIdentifier = false;
    let lastIdentifierX: number | undefined;
    let lastIdentifierY: number | undefined;
    let lastIdentifierZ: number | undefined;
    let lastIdentifier: string | undefined;

    const touch = (chunk: CachedChunkBlocks): void => {
        if (mostRecentlyUsed === chunk) return;
        leastRecentlyUsed.delete(chunk);
        leastRecentlyUsed.set(chunk, undefined);
        mostRecentlyUsed = chunk;
    };

    const forgetChunk = (chunk: CachedChunkBlocks): void => {
        const byZ = cachedBlocks.get(chunk.x);
        if (byZ?.get(chunk.z) !== chunk) return;

        byZ.delete(chunk.z);
        if (byZ.size === 0) cachedBlocks.delete(chunk.x);
        leastRecentlyUsed.delete(chunk);
        if (mostRecentlyUsed === chunk) mostRecentlyUsed = undefined;
        cachedBlockCount -= chunk.cells.size;
        if (lastChunk === chunk) lastChunk = undefined;
    };

    const evictLeastRecentlyUsed = (keep?: CachedChunkBlocks): boolean => {
        const oldest = leastRecentlyUsed.keys().next().value;
        if (oldest === undefined || oldest === keep) return false;
        forgetChunk(oldest);
        return true;
    };

    const makeRoom = (keep?: CachedChunkBlocks): boolean => {
        while (cachedBlockCount >= cacheLimit || leastRecentlyUsed.size >= chunkLimit) {
            if (!evictLeastRecentlyUsed(keep)) return false;
        }
        return cacheLimit > 0 && chunkLimit > 0;
    };

    const clearChunkCells = (chunk: CachedChunkBlocks, identity: object, revision: number): void => {
        cachedBlockCount -= chunk.cells.size;
        chunk.cells.clear();
        chunk.identity = identity;
        chunk.revision = revision;
    };

    const chunkAt = (
        chunkX: number,
        chunkZ: number,
        identity: object,
        revision: number
    ): CachedChunkBlocks | undefined => {
        let chunk = lastChunkX === chunkX && lastChunkZ === chunkZ ? lastChunk : undefined;
        if (chunk === undefined) chunk = cachedBlocks.get(chunkX)?.get(chunkZ);
        if (chunk === undefined) return undefined;

        lastChunkX = chunkX;
        lastChunkZ = chunkZ;
        lastChunk = chunk;
        if (chunk.identity !== identity || chunk.revision !== revision) clearChunkCells(chunk, identity, revision);
        touch(chunk);
        return chunk;
    };

    const invalidateBlockCache = (chunkX?: number, chunkZ?: number): void => {
        if (chunkX !== undefined && chunkZ !== undefined) {
            const changed = cachedBlocks.get(chunkX)?.get(chunkZ);
            if (changed !== undefined) forgetChunk(changed);
        } else {
            cachedBlocks.clear();
            leastRecentlyUsed.clear();
            cachedBlockCount = 0;
            mostRecentlyUsed = undefined;
        }

        lastChunkX = undefined;
        lastChunkZ = undefined;
        lastChunk = undefined;
        hasLastIdentifier = false;
    };

    const readCell = (position: EntityPosition): CachedBlock => {
        if (blocks.runtimeIdAt !== undefined) return blocks.runtimeIdAt(position) ?? NO_BLOCK;
        return blocks.get(position) ?? NO_BLOCK;
    };

    /** Reads a block once per cell until its owning chunk changes. */
    const blockAt = (position: EntityPosition): CachedBlock => {
        if (!Number.isInteger(position.x) || !Number.isInteger(position.y) || !Number.isInteger(position.z))
            return blocks.get(position) ?? NO_BLOCK;

        const chunkX = Math.floor(position.x / 16);
        const chunkZ = Math.floor(position.z / 16);
        const localX = position.x - chunkX * 16;
        const localZ = position.z - chunkZ * 16;
        const cell = position.y * 256 + localZ * 16 + localX;
        const identity = persistsAcrossTicks ? blocks.blockChunkIdentityAt!(position) : TICK_SCOPED_CHUNK;
        if (identity === undefined) return readCell(position);

        const revision = persistsAcrossTicks ? blocks.blockChunkRevisionAt!(position) : 0;
        if (revision === undefined) return readCell(position);

        let chunk = chunkAt(chunkX, chunkZ, identity, revision);
        const cached = chunk?.cells.get(cell);
        if (cached !== undefined) return cached;

        const block = readCell(position);
        if (chunk === undefined) {
            if (!makeRoom()) return block;
            let byZ = cachedBlocks.get(chunkX);
            if (byZ === undefined) {
                byZ = new Map();
                cachedBlocks.set(chunkX, byZ);
            }
            chunk = { x: chunkX, z: chunkZ, identity, revision, cells: new Map() };
            byZ.set(chunkZ, chunk);
            leastRecentlyUsed.set(chunk, undefined);
            mostRecentlyUsed = chunk;
            lastChunkX = chunkX;
            lastChunkZ = chunkZ;
            lastChunk = chunk;
        } else if (!makeRoom(chunk)) {
            return block;
        }

        chunk.cells.set(cell, block);
        cachedBlockCount += 1;
        return block;
    };

    /**
     * Whether each block with no state values is solid, by identifier.
     *
     * A block with no states has exactly one runtime id, so its `solid`
     * column cannot vary, and air and stone are nearly all of what a path
     * search reads. Keyed on the palette the answer came from, so a content
     * reload throws the memo away with the ids it was computed from.
     */
    let memo: { palette: unknown; solid: Map<string, boolean | undefined> } | undefined;
    const stateless = (): Map<string, boolean | undefined> => {
        const palette = content().blocks.palette;
        if (memo?.palette !== palette) memo = { palette, solid: new Map() };
        return memo.solid;
    };

    /** The `solid` column of one block, computed through the palette. */
    const solidOf = (block: ContentBlock): boolean | undefined => {
        const built = content();
        const palette = built.blocks.palette;
        if (!palette.entry(block.identifier)) return undefined;
        const runtimeId = palette.runtimeId(block.identifier, block.states);
        if (runtimeId === undefined) return undefined;
        return built.blocks.table.solid[runtimeId] === 1;
    };

    interface RuntimeBlockFacts {
        readonly identifier: string | undefined;
        readonly solid: boolean | undefined;
    }

    /** Facts decoded once for each chunk runtime id and current content build. */
    let runtimeFacts: { blocks: ServerContent['blocks']; byRuntimeId: Map<number, RuntimeBlockFacts> } | undefined;
    const factsForRuntimeId = (runtimeId: number): RuntimeBlockFacts => {
        const built = content();
        if (runtimeFacts?.blocks !== built.blocks) runtimeFacts = { blocks: built.blocks, byRuntimeId: new Map() };
        const cached = runtimeFacts.byRuntimeId.get(runtimeId);
        if (cached !== undefined) return cached;

        const state = BlockRuntimeIds.getState(runtimeId);
        let facts: RuntimeBlockFacts;
        if (state === null) {
            facts = { identifier: undefined, solid: undefined };
        } else {
            const identifier = state.name;
            const palette = built.blocks.palette;
            let contentId: number | undefined;
            if (palette.entry(identifier)) {
                try {
                    contentId = palette.runtimeId(identifier, state.properties);
                } catch {
                    // A plugin or a minimal fixture may not declare every runtime state's schema.
                    contentId = undefined;
                }
            }
            facts = {
                identifier,
                solid: contentId === undefined ? undefined : built.blocks.table.solid[contentId] === 1
            };
        }

        runtimeFacts.byRuntimeId.set(runtimeId, facts);
        return facts;
    };

    const identifierOf = (block: CachedBlock): string | undefined => {
        if (block === NO_BLOCK) return undefined;
        return typeof block === 'number' ? factsForRuntimeId(block).identifier : block.identifier;
    };

    /** The `solid` column of the block at a position, or undefined outside the loaded world. */
    const solidAt = (position: EntityPosition): boolean | undefined => {
        const block = blockAt(position);
        if (block === NO_BLOCK) return undefined;
        if (typeof block === 'number') return factsForRuntimeId(block).solid;

        if (Object.keys(block.states).length > 0) return solidOf(block);

        const cache = stateless();
        if (cache.has(block.identifier)) return cache.get(block.identifier);
        const solid = solidOf(block);
        cache.set(block.identifier, solid);
        return solid;
    };

    const identifierAt = (position: EntityPosition): string | undefined => {
        if (
            !persistsAcrossTicks &&
            hasLastIdentifier &&
            lastIdentifierX === position.x &&
            lastIdentifierY === position.y &&
            lastIdentifierZ === position.z
        )
            return lastIdentifier;

        lastIdentifierX = position.x;
        lastIdentifierY = position.y;
        lastIdentifierZ = position.z;
        lastIdentifier = identifierOf(blockAt(position));
        hasLastIdentifier = true;
        return lastIdentifier;
    };

    return {
        view: {
            blockAt: identifierAt,
            isSolid: (position) => solidAt(position) === true,
            // A liquid is not solid, so this is the same question asked the other way round; an
            // unloaded block is impassable, which stops a path from being planned off the edge of
            // the loaded world.
            isPassable: (position) => solidAt(position) === false,
            isWater: (position) => {
                const identifier = identifierAt(position);
                return identifier !== undefined && WATER.has(identifier);
            },
            isLava: (position) => {
                const identifier = identifierAt(position);
                return identifier !== undefined && LAVA.has(identifier);
            },
            isDamaging: (position) => {
                const identifier = identifierAt(position);
                return identifier !== undefined && DAMAGING.has(identifier);
            },
            isClimbable: (position) => {
                const identifier = identifierAt(position);
                return identifier !== undefined && CLIMBABLE.has(identifier);
            },
            isLadder: (position) => identifierAt(position) === 'minecraft:ladder',
            isPortal: (position) => {
                const identifier = identifierAt(position);
                return identifier !== undefined && PORTALS.has(identifier);
            },
            isSunlit: (position) =>
                level === undefined
                    ? blocks.light(position) >= SUNLIT_LIGHT_LEVEL
                    : level.hasSkyLight && isDay(level.dayTime()) && blocks.skyLight?.(position) === SUNLIT_LIGHT_LEVEL,
            // The engine's open-sky value is 15; keeping this separate from `isSunlit` matters
            // because Java asks sky visibility independently of daytime.
            canSeeSky: (position) => level?.hasSkyLight === true && blocks.skyLight?.(position) === SUNLIT_LIGHT_LEVEL,
            walkTargetValue: (position) => {
                // Match LevelReader's light-dependent value curve, then Monster's negation.
                const rawBrightness = blocks.light(position) / SUNLIT_LIGHT_LEVEL;
                const brightness = rawBrightness / (4 - 3 * rawBrightness);
                const ambientLight = level?.ambientLight ?? 0;
                const lightCost = ambientLight + brightness * (1 - ambientLight) - 0.5;
                return -lightCost;
            }
        },
        persistsAcrossTicks,
        invalidateBlockCache
    };
};

/** Full sky light, required for an open-sky position to count as sunlit. */
const SUNLIT_LIGHT_LEVEL = 15;
