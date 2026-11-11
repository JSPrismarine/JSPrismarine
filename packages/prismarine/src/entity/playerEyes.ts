import { Vector3 } from '@jsprismarine/math';

/**
 * How far a player's eyes are above its feet, in blocks.
 *
 * Load-bearing, and not for rendering. Bedrock clients report their position as the position of
 * their *eyes*, and this server stores what the client reports and echoes it back unchanged - so
 * a player's `getPosition` is 1.62 higher than every other entity's, which are feet. Anything
 * comparing a player against another entity's body has to take it off first.
 */
export const EYE_HEIGHT = 1.62;

/** The position a player reports when their feet are at `feet`: the same spot, {@link EYE_HEIGHT} up. */
export const eyePositionAt = (feet: Vector3): Vector3 =>
    new Vector3(feet.getX(), feet.getY() + EYE_HEIGHT, feet.getZ());
