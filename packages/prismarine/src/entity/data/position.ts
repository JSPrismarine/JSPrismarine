import type { EntityPosition } from '@jsprismarine/entities';

/** The block a position falls inside, which is the shape the world adapter takes. */
export const blockPositionOf = (position: EntityPosition) => ({
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
});
