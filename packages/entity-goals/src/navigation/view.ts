import type { EntityPosition } from '@jsprismarine/entities';

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
    /** Whether the block is a portal, for `avoid_portals`. */
    isPortal?(position: EntityPosition): boolean;
    /** Whether an entity climbs the block, such as a ladder or a vine. */
    isClimbable?(position: EntityPosition): boolean;
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

/** The straight-line distance between two positions. */
export const distanceBetween = (a: EntityPosition, b: EntityPosition): number =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The horizontal distance between two positions, ignoring height. */
export const horizontalDistance = (a: EntityPosition, b: EntityPosition): number => Math.hypot(a.x - b.x, a.z - b.z);
