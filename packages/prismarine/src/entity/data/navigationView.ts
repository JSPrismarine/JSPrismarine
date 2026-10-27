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

/** The number of distinct block cells the view will retain between invalidations. */
const MAX_CACHED_BLOCKS = 100_000;
const NO_BLOCK = Symbol('no loaded block');

/** The path finder's block view and the cache control the owning runtime needs. */
export interface CachedNavigationView {
    readonly view: NavigationView;
    /** Drops cached reads after a block or chunk changes. */
    invalidateBlockCache(): void;
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
 */
export const navigationViewOf = (
    blocks: ContentBlockAccess,
    content: () => ServerContent,
    level?: ContentLevelFacts
): CachedNavigationView => {
    /**
     * Block reads shared by every path search in the current tick. A* searches
     * often visit the same cells for nearby entities, and resolving each read
     * through the chunk adapter rebuilds the same block record repeatedly.
     */
    const cachedBlocks = new Map<number, Map<number, Map<number, ContentBlock | typeof NO_BLOCK>>>();
    let cachedBlockCount = 0;
    let cacheEnabled = true;
    let lastChunkX: number | undefined;
    let lastChunkZ: number | undefined;
    let lastCells: Map<number, ContentBlock | typeof NO_BLOCK> | undefined;

    const invalidateBlockCache = (): void => {
        cachedBlocks.clear();
        cachedBlockCount = 0;
        cacheEnabled = true;
        lastChunkX = undefined;
        lastChunkZ = undefined;
        lastCells = undefined;
    };

    /** Reads a block once per cell until the runtime invalidates its view. */
    const blockAt = (position: EntityPosition): ContentBlock | undefined => {
        if (
            !cacheEnabled ||
            !Number.isInteger(position.x) ||
            !Number.isInteger(position.y) ||
            !Number.isInteger(position.z)
        )
            return blocks.get(position);

        const chunkX = Math.floor(position.x / 16);
        const chunkZ = Math.floor(position.z / 16);
        const localX = position.x - chunkX * 16;
        const localZ = position.z - chunkZ * 16;
        const cell = position.y * 256 + localZ * 16 + localX;
        let cells = lastChunkX === chunkX && lastChunkZ === chunkZ ? lastCells : undefined;
        if (cells === undefined) {
            cells = cachedBlocks.get(chunkX)?.get(chunkZ);
            lastChunkX = chunkX;
            lastChunkZ = chunkZ;
            lastCells = cells;
        }
        const cached = cells?.get(cell);
        if (cached !== undefined) {
            const block = cached;
            return block === NO_BLOCK ? undefined : block;
        }

        const block = blocks.get(position);
        if (cachedBlockCount >= MAX_CACHED_BLOCKS) {
            // Stop retaining cells for this tick once the bound is reached;
            // clearing here keeps memory bounded without repeatedly thrashing.
            invalidateBlockCache();
            cacheEnabled = false;
            return block;
        }

        let byChunkZ = cachedBlocks.get(chunkX);
        if (byChunkZ === undefined) {
            byChunkZ = new Map();
            cachedBlocks.set(chunkX, byChunkZ);
        }

        cells = byChunkZ.get(chunkZ);
        if (cells === undefined) {
            cells = new Map();
            byChunkZ.set(chunkZ, cells);
        }

        lastChunkX = chunkX;
        lastChunkZ = chunkZ;
        lastCells = cells;
        cells.set(cell, block ?? NO_BLOCK);
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

    /** The `solid` column of the block at a position, or undefined outside the loaded world. */
    const solidAt = (position: EntityPosition): boolean | undefined => {
        const block = blockAt(position);
        if (block === undefined) return undefined;

        if (Object.keys(block.states).length > 0) return solidOf(block);

        const cache = stateless();
        if (cache.has(block.identifier)) return cache.get(block.identifier);
        const solid = solidOf(block);
        cache.set(block.identifier, solid);
        return solid;
    };

    const identifierAt = (position: EntityPosition): string | undefined => blockAt(position)?.identifier;

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
                    : level.hasSkyLight && isDay(level.dayTime()) && blocks.skyLight?.(position) === SUNLIT_LIGHT_LEVEL
        },
        invalidateBlockCache
    };
};

/** Full sky light, required for an open-sky position to count as sunlit. */
const SUNLIT_LIGHT_LEVEL = 15;
