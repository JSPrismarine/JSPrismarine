/**
 * What the clicked face and the click position say about a placement.
 *
 * `BlockPlaceEvent` carries the face the new block went against and where on
 * that face the click landed. Three families read them: a pillar takes its
 * axis from the face, and a slab and a pair of stairs take their half from
 * the height of the click. The placer's look direction is the fallback, which
 * is what the package used before the event carried a face, and it is still
 * right for a horizontally facing block.
 */
import type { BlockPlaceEvent } from '@jsprismarine/blocks';

import type { HorizontalFace } from '../geometry';
import { axisOfFace, facingFrom } from '../geometry';

/** Which half of a block a placement lands in. */
export type BlockHalf = 'bottom' | 'top';

/** How high up a block face a click has to land to take the top half. */
export const UPPER_HALF_THRESHOLD = 0.5;

/**
 * The axis a pillar takes from the placement.
 *
 * The clicked face decides it: a click on the top or bottom of a block makes
 * the pillar vertical, and a click on a side makes it lie along that side.
 * With no face the placer's look direction stands in, which keeps a
 * horizontal placement right and leaves a vertical one on the default axis.
 *
 * @returns Undefined when the event has neither a face nor a placer.
 */
export const placementAxis = (event: BlockPlaceEvent): 'x' | 'y' | 'z' | undefined => {
    if (event.face !== undefined) return axisOfFace(event.face);
    if (event.placedBy === undefined) return undefined;
    return axisOfFace(facingFrom(event.placedBy.position, event.block.position));
};

/**
 * Which half of the block the placement lands in, which is a slab's
 * `minecraft:vertical_half` and a stair's `upside_down_bit`.
 *
 * Clicking the underside of a block always takes the top half and clicking
 * the top always takes the bottom one. A click on a side takes whichever half
 * it landed in.
 *
 * @returns Undefined when the event has no face to read the half off.
 */
export const placedHalf = (event: BlockPlaceEvent): BlockHalf | undefined => {
    if (event.face === undefined) return undefined;
    if (event.face === 'down') return 'top';
    if (event.face === 'up') return 'bottom';
    const height = event.faceLocation?.y;
    if (height === undefined) return undefined;
    return height > UPPER_HALF_THRESHOLD ? 'top' : 'bottom';
};

/**
 * The horizontal direction a placement faces, which is where the placer was
 * looking rather than which face was clicked.
 *
 * @returns Undefined for a placement the world itself performed.
 */
export const placementFacing = (event: BlockPlaceEvent): HorizontalFace | undefined =>
    event.placedBy === undefined ? undefined : facingFrom(event.placedBy.position, event.block.position);
