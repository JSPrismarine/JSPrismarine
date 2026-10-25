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
import type { ContentBlock, ContentBlockAccess } from '../../content/world/adapter';

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

/**
 * Builds the path finder's view of one dimension.
 *
 * Built once per runtime rather than per query, because the memo below is
 * what makes a path search affordable: one A* expands up to 512 nodes and
 * reads about eight cells at each, so a stroll that finds nothing costs four
 * thousand block reads, and a server runs one of those per wandering mob per
 * tick.
 */
export const navigationViewOf = (blocks: ContentBlockAccess, content: () => ServerContent): NavigationView => {
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
        const block = blocks.get(position);
        if (block === undefined) return undefined;

        if (Object.keys(block.states).length > 0) return solidOf(block);

        const cache = stateless();
        if (cache.has(block.identifier)) return cache.get(block.identifier);
        const solid = solidOf(block);
        cache.set(block.identifier, solid);
        return solid;
    };

    const identifierAt = (position: EntityPosition): string | undefined => blocks.get(position)?.identifier;

    return {
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
        isPortal: (position) => {
            const identifier = identifierAt(position);
            return identifier !== undefined && PORTALS.has(identifier);
        },
        isSunlit: (position) => blocks.light(position) >= SUNLIT_LIGHT_LEVEL
    };
};

/** The light level at which a block counts as in the sun, which is what burns the undead. */
const SUNLIT_LIGHT_LEVEL = 15;
