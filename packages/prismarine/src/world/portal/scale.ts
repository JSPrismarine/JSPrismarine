/**
 * Where a position in one dimension lands in another, before any portal is looked for.
 *
 * Java's `DimensionType.getTeleportationScale(from, to)` is `from.coordinateScale /
 * to.coordinateScale`, 8 from the Overworld to the Nether and 1/8 back.
 * `NetherPortalBlock.getPortalDestination` multiplies x and z by it and hands the result to
 * `WorldBorder.clampToBounds`, which builds a `BlockPos` and so rounds toward negative
 * infinity: -29.9 in the Overworld is -4 in the Nether, not -3. The y is clamped into the
 * destination's logical height, `Mth.clamp(y, minY, minY + logicalHeight - 1)`, which is what
 * keeps a trip from the Overworld's y 200 above the Nether's bedrock roof.
 */
import { Vector3 } from '@jsprismarine/math';

import type { DimensionType } from '../Dimension';

/** Java's `DimensionType.getTeleportationScale`: how many destination blocks one source block is. */
export const teleportationScale = (from: DimensionType, to: DimensionType): number =>
    from.java.coordinateScale / to.java.coordinateScale;

/** The highest y a trip may arrive at: `minY + logicalHeight - 1`, 127 in the Nether and 319 in the Overworld. */
export const logicalTop = (dimension: DimensionType): number => dimension.minY + dimension.java.logicalHeight - 1;

/**
 * The block position a trip from `at` in `from` aims for in `to`.
 *
 * @param at - Where the traveler stands in `from`, as a feet position.
 * @returns A block position: x and z scaled and floored, y floored and clamped into `to`'s
 *   logical height.
 */
export const scalePosition = (from: DimensionType, to: DimensionType, at: Vector3): Vector3 => {
    const scale = teleportationScale(from, to);
    const y = Math.min(logicalTop(to), Math.max(to.minY, Math.floor(at.getY())));
    return new Vector3(Math.floor(at.getX() * scale), y, Math.floor(at.getZ() * scale));
};
