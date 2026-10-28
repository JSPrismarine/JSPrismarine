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
 * It is the column `@jsprismarine/mapping` does not have. Physics and
 * pathfinding use this capture for every palette block, and the overlay uses
 * it to emit `minecraft:collision_box` for blocks that never collide and for
 * blocks with one fixed partial shape. Shapes that change by state still need
 * overlay permutations.
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
    /** Whether any captured state of this block has a collision box. */
    hasCollision: boolean;
    /** Exact boxes when every state shares one shape other than a full cube. */
    collisionBoxes?: readonly (readonly [number, number, number, number, number, number])[];
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
 * Whether any state of a block has collision geometry in Bedrock's captured block table.
 *
 * A block with no collision in any state can safely declare
 * `minecraft:collision_box: false` in the vanilla overlay. States whose collision changes need a
 * permutation and are not represented by this block-level answer.
 * @param {string} identifier - The namespaced block identifier.
 * @returns {boolean | undefined} Whether a captured state has collision geometry, or undefined when uncaptured.
 */
export const bedrockHasCollisionOf = (identifier: string): boolean | undefined => blocks[identifier]?.hasCollision;

/**
 * The captured collision boxes when every state of a block shares one partial shape.
 *
 * Full cubes use Bedrock's default component, blocks without collision use `false`, and blocks
 * whose shape changes by state need a component permutation, so those cases return undefined.
 * Coordinates are normalized to the block cell and ordered min X/Y/Z, then max X/Y/Z.
 * @param identifier - The namespaced Bedrock block identifier.
 * @returns The shared partial shape, or undefined when the default, false, or a state permutation applies.
 */
export const bedrockStaticCollisionBoxesOf = (
    identifier: string
): readonly (readonly [number, number, number, number, number, number])[] | undefined =>
    blocks[identifier]?.collisionBoxes;

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
