import type { EntityPosition } from '@jsprismarine/entities';

/** Java's default entity eye height, as a fraction of the live collision box. */
export const ENTITY_EYE_HEIGHT_FRACTION = 0.85;

/** The block a position falls inside, which is the shape the world adapter takes. */
export const blockPositionOf = (position: EntityPosition) => ({
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    z: Math.floor(position.z)
});

/** Returns the default eye position for an entity at its feet position. */
export const entityEyePosition = (position: EntityPosition, height: number): EntityPosition => ({
    x: position.x,
    y: position.y + height * ENTITY_EYE_HEIGHT_FRACTION,
    z: position.z
});
