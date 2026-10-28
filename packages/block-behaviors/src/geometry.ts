/**
 * Faces, offsets and the integer state domains Bedrock encodes a direction
 * in.
 *
 * Bedrock writes a direction four different ways and the orders do not agree,
 * so each one is a named table here and the families index it rather than
 * doing arithmetic on a raw number.
 */
import type { BlockFace, BlockPosition } from '@jsprismarine/blocks';
import { BLOCK_FACES } from '@jsprismarine/blocks';

/** The unit step from a block to the neighbor on one face. */
export const FACE_STEPS: Readonly<Record<BlockFace, BlockPosition>> = {
    down: { x: 0, y: -1, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    north: { x: 0, y: 0, z: -1 },
    south: { x: 0, y: 0, z: 1 },
    west: { x: -1, y: 0, z: 0 },
    east: { x: 1, y: 0, z: 0 }
};

/** The four faces a connection, a wall mount or a cardinal state can use. */
export const HORIZONTAL_FACES = ['north', 'south', 'west', 'east'] as const satisfies readonly BlockFace[];

/** One of {@link HORIZONTAL_FACES}. */
export type HorizontalFace = (typeof HORIZONTAL_FACES)[number];

const OPPOSITES: Readonly<Record<BlockFace, BlockFace>> = {
    down: 'up',
    up: 'down',
    north: 'south',
    south: 'north',
    west: 'east',
    east: 'west'
};

const CLOCKWISE: Readonly<Record<BlockFace, BlockFace>> = {
    down: 'down',
    up: 'up',
    north: 'east',
    east: 'south',
    south: 'west',
    west: 'north'
};

/** The horizontal face across the block, which stays horizontal. */
export function opposite(face: HorizontalFace): HorizontalFace;
/** The face across the block from this one. */
export function opposite(face: BlockFace): BlockFace;
/**
 * The face across the block from this one.
 *
 * The horizontal overload keeps a horizontal face horizontal, so a caller
 * that already knows it has one does not have to narrow the result back.
 */
export function opposite(face: BlockFace): BlockFace {
    return OPPOSITES[face];
}

/** The horizontal face a quarter turn clockwise, which stays horizontal. */
export function rotateClockwise(face: HorizontalFace): HorizontalFace;
/** The face a quarter turn clockwise; a vertical face is unchanged. */
export function rotateClockwise(face: BlockFace): BlockFace;
/** The face a quarter turn clockwise when seen from above. */
export function rotateClockwise(face: BlockFace): BlockFace {
    return CLOCKWISE[face];
}

/** The horizontal face a quarter turn counterclockwise, which stays horizontal. */
export function rotateCounterClockwise(face: HorizontalFace): HorizontalFace;
/** The face a quarter turn counterclockwise; a vertical face is unchanged. */
export function rotateCounterClockwise(face: BlockFace): BlockFace;
/** The face a quarter turn counterclockwise when seen from above. */
export function rotateCounterClockwise(face: BlockFace): BlockFace {
    return CLOCKWISE[CLOCKWISE[CLOCKWISE[face]]];
}

/**
 * The position `distance` blocks along a face.
 *
 * @param distance - Blocks to step, which may be negative to step backwards.
 */
export const offset = (position: BlockPosition, face: BlockFace, distance = 1): BlockPosition => {
    const step = FACE_STEPS[face];
    return {
        x: position.x + step.x * distance,
        y: position.y + step.y * distance,
        z: position.z + step.z * distance
    };
};

/** Whether two positions name the same block. */
export const samePosition = (a: BlockPosition, b: BlockPosition): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/** The taxicab distance between two positions, in blocks. */
export const blockDistance = (a: BlockPosition, b: BlockPosition): number =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);

/**
 * The `facing_direction` state's domain, which is Bedrock's `Facing.json`
 * order and the same order {@link BLOCK_FACES} is written in.
 */
export const FACING_DIRECTIONS = BLOCK_FACES;

/** The face a `facing_direction` value names, or undefined when it is out of range. */
export const faceOfFacingDirection = (value: number): BlockFace | undefined => FACING_DIRECTIONS[value];

/** The `facing_direction` value for a face. */
export const facingDirectionOf = (face: BlockFace): number => FACING_DIRECTIONS.indexOf(face);

/**
 * The `minecraft:cardinal_direction` domain, in the order the palette
 * declares its values. `cardinalDirections.test.ts` checks the order against
 * the captured palette, which is the published source for it.
 */
export const CARDINAL_DIRECTIONS = ['south', 'west', 'north', 'east'] as const satisfies readonly HorizontalFace[];

/** The cardinal direction a Bedrock yaw faces, rounded to the nearest quarter turn. */
export const facingFromYaw = (yaw: number): HorizontalFace => {
    const quarterTurns = Math.round(yaw / 90);
    const index =
        ((quarterTurns % CARDINAL_DIRECTIONS.length) + CARDINAL_DIRECTIONS.length) % CARDINAL_DIRECTIONS.length;
    return CARDINAL_DIRECTIONS[index] ?? 'south';
};

/**
 * The `weirdo_direction` domain stairs are placed with, which the numeric
 * `direction` of a trapdoor uses too. It is a separate table from
 * {@link CARDINAL_DIRECTIONS} because the legacy numeric state starts at east.
 */
export const WEIRDO_DIRECTIONS = ['east', 'west', 'south', 'north'] as const satisfies readonly HorizontalFace[];

/** The `torch_facing_direction` domain, which names the face the torch stands on. */
export const TORCH_FACING = ['unknown', 'west', 'east', 'north', 'south', 'top'] as const;

/**
 * The horizontal face an actor at `from` is looking toward when it clicks a
 * block at `to`, taken from the larger of the two horizontal offsets.
 */
export const facingFrom = (from: BlockPosition, to: BlockPosition): HorizontalFace => {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    if (Math.abs(dx) >= Math.abs(dz)) return dx >= 0 ? 'east' : 'west';
    return dz >= 0 ? 'south' : 'north';
};

/** Whether a face points along the Y axis. */
export const isVertical = (face: BlockFace): boolean => face === 'up' || face === 'down';

/** The `pillar_axis` value a block takes when it is placed against a face. */
export const axisOfFace = (face: BlockFace): 'x' | 'y' | 'z' =>
    isVertical(face) ? 'y' : face === 'east' || face === 'west' ? 'x' : 'z';
