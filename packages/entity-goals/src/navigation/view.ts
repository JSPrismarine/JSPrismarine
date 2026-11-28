import type { EntityPosition } from '@jsprismarine/entities';
import { hypot3 } from '@jsprismarine/math';

/**
 * What the path finder asks the world about one block.
 *
 * This is the second seam the server implements, beside `EntityActuator`.
 * Every member but the first four is optional, following the convention
 * `FilterEntityView` sets in `@jsprismarine/entities`: a fact nothing answers
 * is treated as absent rather than stopping the search, so a server can
 * implement doors, sunlight and damage blocks later without the goals
 * breaking.
 *
 * Positions are whole-block coordinates. The path finder floors before it asks,
 * and it hands the same position object to every call: a view reads the three
 * numbers and answers, and must not keep the object or key a cache on it.
 */

/** One door the path finder meets, as `can_pass_doors` and its siblings read it. */
export interface DoorState {
    /** Whether the door stands open now. */
    readonly open: boolean;
    /** Whether only a mechanism can open it, which is what `can_open_iron_doors` covers. */
    readonly iron: boolean;
}

/** The world as the path finder reads it, one block at a time. */
export interface NavigationView {
    /** The block identifier, such as `minecraft:stone`, or undefined outside the loaded world. */
    blockAt(position: EntityPosition): string | undefined;
    /** Whether an entity fits in the block, which liquids and plants allow and full blocks do not. */
    isPassable(position: EntityPosition): boolean;
    /** Whether the block holds an entity standing on top of it. */
    isSolid(position: EntityPosition): boolean;
    /** Whether the block is water or waterlogged. */
    isWater(position: EntityPosition): boolean;
    /** Whether the block is lava. */
    isLava(position: EntityPosition): boolean;
    /** The door at the block, or undefined when it is not a door. */
    doorAt?(position: EntityPosition): DoorState | undefined;
    /** Whether standing in the block hurts, for `avoid_damage_blocks`. */
    isDamaging?(position: EntityPosition): boolean;
    /** Whether the sky reaches the block, for `avoid_sun`. */
    isSunlit?(position: EntityPosition): boolean;
    /** Whether Java's level says the block column can see the sky. */
    canSeeSky?(position: EntityPosition): boolean;
    /** A monster's Java walk-target value at the block, for hide-position searches. */
    walkTargetValue?(position: EntityPosition): number;
    /**
     * Java's `LevelReader.getPathfindingCostFromLightLevels` at the block: its light-dependent
     * brightness less 0.5, which an animal's walk-target value is off grass.
     *
     * @javaSee LevelReader.getPathfindingCostFromLightLevels
     */
    lightPathfindingCost?(position: EntityPosition): number;
    /** Whether the block is a portal, for `avoid_portals`. */
    isPortal?(position: EntityPosition): boolean;
    /** Whether an entity climbs the block, such as a ladder or a vine. */
    isClimbable?(position: EntityPosition): boolean;
    /** Whether the block is a ladder, which `minecraft:can_climb` lets entities climb. */
    isLadder?(position: EntityPosition): boolean;
    /**
     * How high the block's collision shape reaches above the block's own floor, in blocks: 1 for
     * a full block, 1.5 for a fence or a wall, 0 for a block with no collision. A block that
     * reaches above 1 can neither be stood on nor stepped over, Java's `PathType.FENCE`.
     *
     * @javaSee PathType.FENCE
     */
    collisionTop?(position: EntityPosition): number;
}

/** Rounds a position down to the block that contains it. */
export const blockOf = (position: EntityPosition): EntityPosition => ({
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
});

/** The center of the block's top face, which is where a path node puts an entity. */
export const centerOf = (block: EntityPosition): EntityPosition => ({
    x: Math.floor(block.x) + 0.5,
    y: Math.floor(block.y),
    z: Math.floor(block.z) + 0.5
});

/**
 * Where a path node puts an entity `width` blocks wide, Java's `Path.getEntityPosAtNode`: the
 * middle of the `width` by `width` cells the node's corner starts, which for a one-block mob is
 * {@link centerOf}.
 *
 * @javaSource Path.getEntityPosAtNode
 */
export const entityPositionAtNode = (node: EntityPosition, width = 1): EntityPosition => ({
    x: Math.floor(node.x) + width * 0.5,
    y: Math.floor(node.y),
    z: Math.floor(node.z) + width * 0.5
});

/** The node whose cells an entity `width` blocks wide stands in, the inverse of {@link entityPositionAtNode}. */
export const nodeOfEntityPosition = (position: EntityPosition, width = 1): EntityPosition => ({
    x: Math.floor(position.x - width * 0.5 + 0.5),
    y: Math.floor(position.y),
    z: Math.floor(position.z - width * 0.5 + 0.5)
});

/** The straight-line distance between two positions. */
export const distanceBetween = (a: EntityPosition, b: EntityPosition): number =>
    hypot3(a.x - b.x, a.y - b.y, a.z - b.z);

/** The horizontal distance between two positions, ignoring height. */
export const horizontalDistance = (a: EntityPosition, b: EntityPosition): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * How far {@link landPositionAt} lifts a draw out of the ground before giving up, in blocks.
 * Java's `RandomPos.moveUpOutOfSolid` lifts to the world's top; a draw this deep inside a cliff
 * is refused instead.
 *
 * @javaSee RandomPos.moveUpOutOfSolid
 */
const LAND_LIFT_LIMIT = 32;

/**
 * One draw of Java's `LandRandomPos`: a draw with no solid block under it is refused
 * (`GoalUtils.isNotStable`), and one inside the ground is lifted to the first open block above it
 * (`RandomPos.moveUpOutOfSolid`). Whether the walker may end up in what it was lifted into is the
 * caller's ({@link NavigationProfile}'s `hasPathMalus`).
 *
 * @param view - The blocks.
 * @param drawn - The drawn block.
 * @returns The block the walker would stand in, or undefined when the draw is refused.
 * @javaSee LandRandomPos.generateRandomPosTowardDirection
 */
export const landPositionAt = (view: NavigationView, drawn: EntityPosition): EntityPosition | undefined => {
    const x = Math.floor(drawn.x);
    const z = Math.floor(drawn.z);
    let y = Math.floor(drawn.y);
    if (!view.isSolid({ x, y: y - 1, z })) return undefined;
    for (let lifted = 0; view.isSolid({ x, y, z }); lifted += 1) {
        if (lifted >= LAND_LIFT_LIMIT) return undefined;
        y += 1;
    }
    const at = { x, y, z };
    return view.isPassable(at) ? at : undefined;
};
