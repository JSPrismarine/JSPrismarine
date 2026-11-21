/**
 * What Bedrock's own block table says about a block's shape per palette state,
 * and what a liquid does to each block.
 *
 * Neither edition publishes shapes as data a pack can carry, and the Java jar
 * publishes Java's, which the Bedrock client does not draw: a cactus is
 * 0.9375 tall in Java and a full block in Bedrock, and the client is what
 * decides where a player may stand. So the shape table comes from a Bedrock
 * Dedicated Server's own block table, as CloudburstMC/Data dumped it for
 * 1.26.51. Nothing this repository can run reproduces that dump: the Script
 * API reports no collision shapes. The shape table is therefore checked in and
 * no longer regenerated; `docs/adr/0019-bedrock-data-comes-from-bds.md` records
 * why. A block outside it is taken to be a full cube.
 *
 * The liquid reactions come from the pinned server's Script API instead, in
 * `tables/blockLiquidReactions.json`, which
 * `pnpm --filter @jsprismarine/blocks run generate:liquid-reactions` writes
 * from the `dump` pass of `dump:bedrock`.
 *
 * It is the column `@jsprismarine/mapping` does not have. Physics and
 * pathfinding use this capture for every palette block, and the overlay uses
 * it to emit `minecraft:collision_box` for blocks that never collide, fixed
 * partial shapes, and state-varying shapes.
 */
import { collisionBox } from './components';
import table from './tables/blockGeometry';
import liquidTable from './tables/blockLiquidReactions.json';
import type { BlockFace, HookBlock } from './hooks';
import type { BlockState, BlockType } from './types';

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
    /** Whether any captured state of this block has a collision box. */
    hasCollision: boolean;
    /** Exact boxes when every state shares one shape other than a full cube. */
    collisionBoxes?: readonly BedrockCollisionBox[];
    /** The boxes of the vanilla default state when collision changes by state. */
    collisionDefaultBoxes?: readonly BedrockCollisionBox[];
    /** The shape overrides for states whose boxes differ from the vanilla default state. */
    collisionPermutations?: readonly BedrockCollisionPermutation[];
    /** The states that differ, keyed by their runtime id as an unsigned 32-bit number. */
    states?: Record<string, number>;
}

/** One normalized collision box: minimum X/Y/Z, then maximum X/Y/Z. */
export type BedrockCollisionBox = readonly [number, number, number, number, number, number];

/** The collision boxes applied when a vanilla block state condition matches. */
export interface BedrockCollisionPermutation {
    /** A Molang condition using `query.block_state`. */
    readonly condition: string;
    /** The boxes normalized to the block cell. An empty list means no collision. */
    readonly boxes: readonly BedrockCollisionBox[];
}

// The generated table is parsed JSON; the generator guarantees this shape.
const blocks = table.blocks as unknown as Record<string, GeometryRow>;

/** Each captured block type's liquid reaction, keyed by identifier. */
const liquidReactions: Readonly<Record<string, string>> = liquidTable.blocks;

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
 * Blocks newer than the shape table, reviewed one by one. The table was captured at 1.26.51
 * and nothing can refresh it (issue #3106), so a block a later release added has no row. The
 * overlay declares each one here a full cube, the safe direction {@link FULL_BLOCK} describes,
 * and refuses any other block without a row. `geometry.test.ts` fails once one of these gains a
 * row, so a measured shape is never shadowed by this list.
 */
export const BLOCKS_WITHOUT_CAPTURED_GEOMETRY: ReadonlySet<string> = new Set([
    // 1.26.60.
    'minecraft:disc_press',
    'minecraft:ice_crystal',
    'minecraft:icicle'
]);

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
 * The captured collision boxes of a varying-shape block's default state.
 *
 * An empty list means the default state does not collide. A full cube is
 * returned explicitly so a caller can override it when another state is
 * partial or non-colliding.
 * @param identifier - The namespaced Bedrock block identifier.
 * @returns The default state's exact shape, or undefined when the shape is fixed.
 */
export const bedrockCollisionDefaultBoxesOf = (identifier: string): readonly BedrockCollisionBox[] | undefined =>
    blocks[identifier]?.collisionDefaultBoxes;

/**
 * The captured collision-box overrides for states whose shape differs from the default.
 *
 * Each condition selects the state values that share the listed boxes. An
 * empty box list means `minecraft:collision_box: false` for those states.
 * @param identifier - The namespaced Bedrock block identifier.
 * @returns The varying state shapes, or an empty list when the block's shape is fixed or uncaptured.
 */
export const bedrockCollisionPermutationsOf = (identifier: string): readonly BedrockCollisionPermutation[] =>
    blocks[identifier]?.collisionPermutations ?? [];

/**
 * What a liquid flowing into this block's cell does to it.
 * @param {string} identifier - The namespaced block identifier.
 * @returns {LiquidReaction | undefined} The reaction, or undefined for a block the capture has no row for.
 */
export const bedrockLiquidReactionOf = (identifier: string): LiquidReaction | undefined => {
    const liquid = liquidReactions[identifier];
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

/** The shape of an ordinary cube, which is what a block with no collision box component has. */
export const FULL_CUBE_SHAPE: readonly BedrockCollisionBox[] = [[0, 0, 0, 1, 1, 1]];

/**
 * The collision boxes of one resolved block state, normalized to its cell.
 *
 * Read from the state's `minecraft:collision_box`, which the vanilla overlay fills from the same
 * capture {@link bedrockCollisionTopOf} reads, so a slab is half a cell, a carpet a sixteenth and
 * a fence one and a half cells tall. A box may reach past its cell, as a fence's does. A box with
 * no size on every axis does not collide, matching how the `solid` flag reads the component.
 * @param state - The resolved state.
 * @returns The boxes, ordered min X/Y/Z then max X/Y/Z; empty for a block nothing collides with.
 * @example
 * ```typescript
 * collisionShapeOf(blocks.types.get('minecraft:stone_slab')!.state()); // [[0, 0, 0, 1, 0.5, 1]]
 * ```
 */
export const collisionShapeOf = (state: Pick<BlockState, 'content'>): readonly BedrockCollisionBox[] => {
    const component = state.content.params(collisionBox);
    if (component === undefined || component === true) return FULL_CUBE_SHAPE;
    if (component === false) return [];
    const boxes = Array.isArray(component) ? component : [component];
    return boxes.flatMap(({ origin, size }) => {
        if (size.every((side: number) => side === 0)) return [];
        const minX = (origin[0] + 8) / 16;
        const minY = origin[1] / 16;
        const minZ = (origin[2] + 8) / 16;
        return [[minX, minY, minZ, minX + size[0] / 16, minY + size[1] / 16, minZ + size[2] / 16] as const];
    });
};

/**
 * Whether a shape fills its whole cell, which is what Java's `isCollisionShapeFullBlock` asks.
 *
 * The boxes together decide it, so two half blocks side by side fill the cell. The cell is cut
 * at every box face inside it, and each piece must lie in some box.
 * @param shape - Boxes normalized to the cell.
 * @returns Whether the boxes cover the cell.
 */
export const isFullCubeShape = (shape: readonly BedrockCollisionBox[]): boolean => {
    if (shape.length === 0) return false;
    /** The cuts along one axis: the cell's faces and every box face between them. */
    const cuts = (low: 0 | 1 | 2, high: 3 | 4 | 5): number[] =>
        [...new Set([0, 1, ...shape.flatMap((box) => [box[low], box[high]]).filter((cut) => cut > 0 && cut < 1)])].sort(
            (left, right) => left - right
        );
    const [xs, ys, zs] = [cuts(0, 3), cuts(1, 4), cuts(2, 5)];
    /** The middle of each piece between two neighboring cuts. */
    const middles = (at: number[]): number[] => at.slice(1).map((cut, index) => (cut + (at[index] ?? cut)) / 2);
    return middles(xs).every((x) =>
        middles(ys).every((y) =>
            middles(zs).every((z) =>
                shape.some(
                    ([minX, minY, minZ, maxX, maxY, maxZ]) =>
                        minX <= x && x <= maxX && minY <= y && y <= maxY && minZ <= z && z <= maxZ
                )
            )
        )
    );
};

/** The axis each face looks along, 0 for X, 1 for Y and 2 for Z, and whether it is the cell's high side. */
const FACE_AXES: Readonly<Record<BlockFace, { readonly axis: 0 | 1 | 2; readonly high: boolean }>> = {
    down: { axis: 1, high: false },
    up: { axis: 1, high: true },
    north: { axis: 2, high: false },
    south: { axis: 2, high: true },
    west: { axis: 0, high: false },
    east: { axis: 0, high: true }
};

/** The three axes, and where each one's maximum sits in a box. */
const AXES = [0, 1, 2] as const;
const MAX_OF = { 0: 3, 1: 4, 2: 5 } as const;

/** Whether rectangles, each min U, min V, max U, max V, cover the unit square between them. */
const coversSquare = (rects: readonly (readonly [number, number, number, number])[]): boolean => {
    if (rects.length === 0) return false;
    const cuts = (low: 0 | 1, high: 2 | 3): number[] =>
        [
            ...new Set([0, 1, ...rects.flatMap((rect) => [rect[low], rect[high]]).filter((cut) => cut > 0 && cut < 1)])
        ].sort((left, right) => left - right);
    const middles = (at: number[]): number[] => at.slice(1).map((cut, index) => (cut + (at[index] ?? cut)) / 2);
    const [us, vs] = [middles(cuts(0, 2)), middles(cuts(1, 3))];
    return us.every((u) =>
        vs.every((v) => rects.some(([minU, minV, maxU, maxV]) => minU <= u && u <= maxU && minV <= v && v <= maxV))
    );
};

/**
 * Whether two neighboring shapes together close the face between them, Java's
 * `Shapes.mergedFaceOccludes`: the boxes of `shape` that reach its `face` side and those of
 * `neighbor` that reach the opposite side, laid on the face, must cover all of it. A fluid passes
 * between two cells only where they do not, which is how a bottom slab keeps its water from the
 * cell below.
 * @param shape - The boxes of the block the face belongs to, normalized to its cell.
 * @param neighbor - The boxes of the block on the other side of the face, normalized to its cell.
 * @param face - The face of `shape`'s cell that the two share.
 * @returns Whether the face is closed.
 */
export const mergedFaceOccludes = (
    shape: readonly BedrockCollisionBox[],
    neighbor: readonly BedrockCollisionBox[],
    face: BlockFace
): boolean => {
    const { axis, high } = FACE_AXES[face];
    const [u, v] = AXES.filter((each) => each !== axis);
    if (u === undefined || v === undefined) return false;
    const onFace = (boxes: readonly BedrockCollisionBox[], onHigh: boolean) =>
        boxes
            .filter((box) => (onHigh ? box[MAX_OF[axis]] >= 1 : box[axis] <= 0))
            .map((box) => [box[u], box[v], box[MAX_OF[u]], box[MAX_OF[v]]] as const);
    return coversSquare([...onFace(shape, high), ...onFace(neighbor, !high)]);
};

/**
 * Whether two neighboring blocks' collision shapes together close the face between them, by
 * {@link mergedFaceOccludes} over each state's {@link collisionShapeOf}. The fluid rules ask it
 * before a fluid passes. A block the capture says collides with nothing, such as air or water, has
 * no boxes, and one the registry does not know has no shape to read, so it closes nothing.
 * @param types - The block types the blocks' states come from.
 * @param block - The block whose `face` the two share.
 * @param neighbor - The block on the other side.
 * @param face - The side of `block` that `neighbor` is on.
 * @returns Whether the face is closed.
 */
export const faceOccludesIn = (
    types: ReadonlyMap<string, BlockType>,
    block: Pick<HookBlock, 'identifier' | 'states'>,
    neighbor: Pick<HookBlock, 'identifier' | 'states'>,
    face: BlockFace
): boolean => {
    const shapeOf = (each: Pick<HookBlock, 'identifier' | 'states'>) => {
        // Air and the fluids collide with nothing in the capture, whatever their state lacks.
        if (bedrockHasCollisionOf(each.identifier) === false) return [];
        const state = types.get(each.identifier)?.state(each.states);
        return state === undefined ? undefined : collisionShapeOf(state);
    };
    const shape = shapeOf(block);
    const neighborShape = shapeOf(neighbor);
    return shape !== undefined && neighborShape !== undefined && mergedFaceOccludes(shape, neighborShape, face);
};
