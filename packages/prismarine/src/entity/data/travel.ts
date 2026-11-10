/** Java's `LivingEntity.travel` on land: the drag, the friction and the stride a mob's input gives. */

/** Java's horizontal drag on an airborne entity, applied once a tick. */
export const DRAG = 0.91;

/** Java's default slipperiness for a block the loaded world cannot resolve. */
export const DEFAULT_BLOCK_FRICTION = 0.6;

/** The numerator of Java's `LivingEntity.getFrictionInfluencedSpeed`, the cube of the default friction. */
const FRICTION_SPEED_REFERENCE = 0.21600002;

/** Java's `LivingEntity.getFlyingSpeed`: what a mob's input is scaled by while it is off the ground. */
const AIR_SPEED = 0.02;

/** One tick of a walk: how far the mob goes, and the momentum it carries into the next tick. */
export interface WalkStride {
    /** Blocks moved along the heading this tick. */
    readonly stride: number;
    /** Blocks per tick carried into the next tick, after drag. */
    readonly momentum: number;
}

/**
 * One tick of Java's `LivingEntity.travel` along a mob's heading.
 *
 * Java's move control sets a mob's forward input to its speed, the movement attribute times the
 * goal's speed modifier, and `moveRelative` scales that input by the speed again on the ground,
 * or by `0.02` in the air. The momentum then loses the block's friction times `0.91`, or `0.91`
 * in the air. A zombie at `0.23` settles at `0.23² / (1 - 0.546)`, about `0.117` blocks a tick,
 * and a slime covers ground only in the hop its jump tick launched.
 *
 * @param momentum - Blocks per tick the walk carried out of the last tick.
 * @param speed - The movement attribute times the goal's speed multiplier.
 * @param grounded - Whether the mob stands on the ground at the start of the tick.
 * @param friction - The Java friction of the block under the mob.
 * @returns The stride this tick and the momentum left for the next.
 */
export const walkStride = (momentum: number, speed: number, grounded: boolean, friction: number): WalkStride => {
    // `moveRelative` normalizes an input longer than one block.
    const input = Math.min(speed, 1);
    const acceleration = grounded ? input * speed * (FRICTION_SPEED_REFERENCE / friction ** 3) : input * AIR_SPEED;
    const stride = momentum + acceleration;
    return { stride, momentum: stride * (grounded ? friction * DRAG : DRAG) };
};
