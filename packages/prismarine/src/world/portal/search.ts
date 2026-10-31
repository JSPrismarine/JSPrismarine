/**
 * From the nearest portal block to where a traveler stands in the portal it belongs to.
 *
 * Java's `NetherPortalBlock.getExitPortal` recovers the whole portal around the found block
 * with `BlockUtil.getLargestRectangleAround(pos, axis, 21, Y, 21, isPortal)`, then
 * `createDimensionTransition` keeps the traveler's place inside the source portal as a
 * fraction of its width and height (`PortalShape.getRelativePosition`) and applies that
 * fraction to the destination rectangle, turning 90 degrees when the two axes differ
 * (`bipush 90`). This module is those three steps over a block lookup.
 */
import {
    PORTAL_MAX_HEIGHT,
    PORTAL_MAX_WIDTH,
    alongPortalAxis,
    isNetherPortal,
    portalAxisOf
} from '@jsprismarine/block-behaviors';
import type { PortalAxis } from '@jsprismarine/block-behaviors';
import type { BlockPosition, BlockStateValue } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';

import type { PortalIndex } from './PortalIndex';

/** A block as the search reads one: the same shape `World.loadedBlockAt` answers. */
export interface IndexedBlock {
    readonly name: string;
    readonly states: Readonly<Record<string, BlockStateValue>>;
}

/** The block at a position, or undefined where the chunk is not in memory. */
export type BlockLookup = (at: BlockPosition) => IndexedBlock | undefined;

/**
 * The interior of one lit portal, Java's `BlockUtil.FoundRectangle`.
 *
 * `minCorner` is the lowest interior block at the negative end of the axis; the interior
 * runs `width` blocks toward positive `axis` and `height` blocks up from it.
 */
export interface PortalRectangle {
    readonly minCorner: Vector3;
    readonly axis: PortalAxis;
    readonly width: number;
    readonly height: number;
}

/** How big the traveler is, from its collision box. Java's `EntityDimensions`. */
export interface TravelerSize {
    readonly width: number;
    readonly height: number;
}

/** Where a traveler stands inside a portal, as fractions. Java's `PortalShape.getRelativePosition`. */
export interface RelativePortalPosition {
    /** Fraction of the free width along the axis, 0 at the negative end and 1 at the positive. */
    readonly x: number;
    /** Fraction of the free height, 0 at the floor. */
    readonly y: number;
    /** Offset across the axis from the portal plane's center, in blocks. */
    readonly z: number;
}

/** Java's `Direction.Axis` rotation on a yaw: a quarter turn when the destination's axis differs. */
export const PORTAL_AXIS_TURN_DEGREES = 90;

const isPortalAt = (blockAt: BlockLookup, at: BlockPosition): boolean => {
    const block = blockAt(at);
    return block !== undefined && isNetherPortal(block.name);
};

/** How many portal blocks run from `at` in one direction, `at` included, up to `limit`. */
const runLength = (
    blockAt: BlockLookup,
    at: BlockPosition,
    step: (at: BlockPosition) => BlockPosition,
    limit: number
) => {
    let length = 0;
    let position = at;
    while (length < limit && isPortalAt(blockAt, position)) {
        length += 1;
        position = step(position);
    }
    return length;
};

/**
 * The axis a portal block runs along: its `portal_axis`, or for `unknown`, which a command
 * wrote, the axis a neighboring portal block lies on, x when it stands alone.
 */
const axisAt = (blockAt: BlockLookup, at: BlockPosition): PortalAxis => {
    const block = blockAt(at);
    const declared = block === undefined ? undefined : portalAxisOf(block);
    if (declared !== undefined) return declared;
    if (isPortalAt(blockAt, alongPortalAxis(at, 'x', 1)) || isPortalAt(blockAt, alongPortalAxis(at, 'x', -1)))
        return 'x';
    if (isPortalAt(blockAt, alongPortalAxis(at, 'z', 1)) || isPortalAt(blockAt, alongPortalAxis(at, 'z', -1)))
        return 'z';
    return 'x';
};

/**
 * The portal around a portal block, Java's `getLargestRectangleAround` for the filled
 * rectangle a lit frame is.
 *
 * @returns The rectangle, or undefined when the position holds no portal block.
 */
export const portalRectangleAround = (blockAt: BlockLookup, at: BlockPosition): PortalRectangle | undefined => {
    if (!isPortalAt(blockAt, at)) return undefined;
    const axis = axisAt(blockAt, at);

    const down = (position: BlockPosition) => ({ ...position, y: position.y - 1 });
    const up = (position: BlockPosition) => ({ ...position, y: position.y + 1 });
    const toFloor = runLength(blockAt, at, down, PORTAL_MAX_HEIGHT) - 1;
    const bottom = { ...at, y: at.y - toFloor };
    const toEdge = runLength(blockAt, bottom, (position) => alongPortalAxis(position, axis, -1), PORTAL_MAX_WIDTH) - 1;
    const minCorner = alongPortalAxis(bottom, axis, -toEdge);

    return {
        minCorner: new Vector3(minCorner.x, minCorner.y, minCorner.z),
        axis,
        width: runLength(blockAt, minCorner, (position) => alongPortalAxis(position, axis, 1), PORTAL_MAX_WIDTH),
        height: runLength(blockAt, minCorner, up, PORTAL_MAX_HEIGHT)
    };
};

const alongOf = (at: Vector3, axis: PortalAxis): number => (axis === 'x' ? at.getX() : at.getZ());
const acrossOf = (at: Vector3, axis: PortalAxis): number => (axis === 'x' ? at.getZ() : at.getX());
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Java's `PortalShape.getRelativePosition`: where a traveler stands inside a portal, as a
 * fraction of the width and height left over once its own size is taken off.
 *
 * @param at - The traveler's feet.
 */
export const relativePosition = (
    rectangle: PortalRectangle,
    at: Vector3,
    size: TravelerSize
): RelativePortalPosition => {
    const freeWidth = rectangle.width - size.width;
    const freeHeight = rectangle.height - size.height;
    const corner = rectangle.minCorner;

    const x =
        freeWidth > 0
            ? clamp01((alongOf(at, rectangle.axis) - (alongOf(corner, rectangle.axis) + size.width / 2)) / freeWidth)
            : 0.5;
    const y = freeHeight > 0 ? clamp01((at.getY() - corner.getY()) / freeHeight) : 0;
    const z = acrossOf(at, rectangle.axis) - (acrossOf(corner, rectangle.axis) + 0.5);
    return { x, y, z };
};

/**
 * Java's `NetherPortalBlock.createDimensionTransition` placement: the same relative position
 * applied to the destination portal.
 *
 * `findCollisionFreePosition`, which nudges the traveler out of a block, is not applied; the
 * portal interior is air by construction.
 *
 * @returns The traveler's feet in the destination world.
 */
export const exitPosition = (
    rectangle: PortalRectangle,
    relative: RelativePortalPosition,
    size: TravelerSize
): Vector3 => {
    const corner = rectangle.minCorner;
    const alongOffset = size.width / 2 + (rectangle.width - size.width) * relative.x;
    const y = corner.getY() + (rectangle.height - size.height) * relative.y;
    const acrossOffset = 0.5 + relative.z;
    return rectangle.axis === 'x'
        ? new Vector3(corner.getX() + alongOffset, y, corner.getZ() + acrossOffset)
        : new Vector3(corner.getX() + acrossOffset, y, corner.getZ() + alongOffset);
};

/** The yaw a traveler leaves with: unchanged when both portals run the same way, a quarter turn otherwise. */
export const exitYaw = (yaw: number, from: PortalAxis, to: PortalAxis): number =>
    from === to ? yaw : yaw + PORTAL_AXIS_TURN_DEGREES;

/**
 * The portal a trip arrives in: the one around the nearest indexed portal block within the
 * search radius.
 *
 * @param target - The scaled destination block, from `scalePosition`.
 * @returns The rectangle, or undefined when no portal is within the radius.
 */
export const findExitPortal = (
    index: PortalIndex,
    blockAt: BlockLookup,
    target: Vector3,
    radius: number
): PortalRectangle | undefined => {
    const hit = index.closest(target, radius);
    if (hit === undefined) return undefined;
    return portalRectangleAround(blockAt, { x: hit.getX(), y: hit.getY(), z: hit.getZ() });
};
