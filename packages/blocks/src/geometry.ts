/**
 * What Bedrock's own block table says about a block's shape and about what a
 * liquid does to it, per palette state.
 *
 * Neither edition publishes shapes as data a pack can carry, and the Java jar
 * publishes Java's, which the Bedrock client does not draw: a cactus is
 * 0.9375 tall in Java and a full block in Bedrock, and the client is what
 * decides where a player may stand. So this table comes from a Bedrock
 * Dedicated Server's own block table, captured in
 * `packages/bedrock-data/src/resources/blocks.json` and flattened by
 * `utils/generate-geometry.mjs`.
 *
 * It is the column `@jsprismarine/mapping` does not have. The overlay
 * generator says so in as many words - it can give only 22 named blocks
 * `"minecraft:collision_box": false` because no property table publishes
 * solidity - and physics and pathfinding outside the content runtime had the
 * same hole, filled with hand-written name lists that knew eighty of the
 * twelve hundred blocks.
 */
import table from './tables/blockGeometry.json';

/** What a liquid reaching a block does, as Bedrock's `liquidReactionOnTouch` names it. */
export type LiquidReaction =
    /** The block dams the liquid, which is every ordinary block. */
    | 'blocking'
    /** The liquid washes the block away and leaves it on the ground: a crop, a carpet, a rail. */
    | 'popped'
    /** The liquid destroys the block outright: snow, powder snow, a chorus flower. */
    | 'broken'
    /** The liquid simply occupies the same cell: air, the liquids themselves, a waterloggable plant. */
    | 'none';

interface GeometryRow {
    /** The collision height most of the block's states share. */
    top: number;
    liquid: string;
    /** The states that differ, keyed by their runtime id as an unsigned 32-bit number. */
    states?: Record<string, number>;
}

// The generated table is parsed JSON; the generator guarantees this shape.
const blocks = table.blocks as unknown as Record<string, GeometryRow>;

/** How many palette states the capture covers, which a test pins against the palette. */
export const BEDROCK_GEOMETRY_STATE_COUNT = table.stateCount;

/**
 * An ordinary cube, and what a block outside the capture is taken to be.
 *
 * Wrong in the safe direction: an unknown block is a wall rather than a hole,
 * so nothing falls through the world or walks into a block it cannot see.
 */
export const FULL_BLOCK = 1;

/** A block anything walks straight through. */
export const PASSABLE = 0;

/**
 * How high a body standing in this block's cell would be held up, in blocks.
 *
 * One number per state: the height of the lowest collision surface above the
 * bottom of its own cell. `0` is a block you walk straight through, `1` an
 * ordinary cube, `0.5` a slab or the step of a stair, `1.5` a fence - half a
 * block taller than it looks, which is the entire point of a fence.
 *
 * The lowest surface rather than the tallest, because the question is what
 * holds a body up and what it has to get its feet over. A stair is a bottom
 * slab with a quarter on top, and 0.5 is the part a mob meets.
 *
 * The state matters for exactly the blocks you would expect, and the runtime
 * id is how one is named: which half a slab fills, how deep the snow is,
 * whether the gate is open.
 * @param {string} identifier - The namespaced block identifier.
 * @param {number} [runtimeId] - The state's runtime id, when the caller has it.
 * @returns {number | undefined} The height, or undefined for a block the capture has no row for.
 * @example
 * ```typescript
 * bedrockCollisionTopOf('minecraft:oak_fence'); // 1.5
 * bedrockCollisionTopOf('minecraft:short_grass'); // 0
 * ```
 */
export const bedrockCollisionTopOf = (identifier: string, runtimeId?: number): number | undefined => {
    const row = blocks[identifier];
    if (row === undefined) return undefined;
    if (runtimeId === undefined) return row.top;

    return row.states?.[String(runtimeId >>> 0)] ?? row.top;
};

/**
 * What a liquid flowing into this block's cell does to it.
 * @param {string} identifier - The namespaced block identifier.
 * @returns {LiquidReaction | undefined} The reaction, or undefined for a block the capture has no row for.
 */
export const bedrockLiquidReactionOf = (identifier: string): LiquidReaction | undefined => {
    const liquid = blocks[identifier]?.liquid;
    return liquid === 'blocking' || liquid === 'popped' || liquid === 'broken' || liquid === 'none'
        ? liquid
        : undefined;
};

/**
 * Whether a liquid takes this block's place rather than being dammed by it.
 *
 * True for the 197 blocks a liquid pops, breaks or shares a cell with: every
 * crop, carpet, rail, sapling, torch, coral and flower, the snow layers, and
 * air and the liquids themselves. Vanilla drowns plants rather than damming
 * water behind them, which is what stops a field of wheat holding back a
 * river.
 * @param {string} identifier - The namespaced block identifier.
 * @returns {boolean} Whether liquid flows into it. False for a block outside the capture.
 */
export const isWashedAway = (identifier: string): boolean => {
    const reaction = bedrockLiquidReactionOf(identifier);
    return reaction !== undefined && reaction !== 'blocking';
};
