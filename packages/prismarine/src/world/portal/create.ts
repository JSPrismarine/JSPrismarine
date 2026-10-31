/**
 * Writing a new nether portal where a trip found none.
 *
 * Java's `PortalForcer.createPortal` searches a 16 block radius for footing, forces a
 * floating platform when it finds none, and writes a 4 by 5 frame with six portal blocks on
 * the source portal's axis. The search and the writes are chunk 5's pure functions in
 * `@jsprismarine/block-behaviors`; this module runs them in order over one dimension's
 * bounds and hands back the rectangle the traveler is placed in, which is Java's
 * `FoundRectangle(bottomLeft, 2, 3)`.
 *
 * Bedrock lets only a player trigger creation (wiki, "the incoming entity can be ... only a
 * player in Bedrock Edition"); `DimensionTravel` makes that call, so an item or a mob with
 * no portal to arrive in never reaches here.
 */
import { portalCreationSite, writeNetherPortal } from '@jsprismarine/block-behaviors';
import type { PortalAxis, PortalCreationBounds, WorldActions } from '@jsprismarine/block-behaviors';
import type { BlockPosition } from '@jsprismarine/blocks';
import { Vector3 } from '@jsprismarine/math';

import type { DimensionType } from '../Dimension';
import type { PortalRectangle } from './search';

/** Java's `PortalForcer.createPortal` result: a 2 wide, 3 tall interior. */
const CREATED_WIDTH = 2;
const CREATED_HEIGHT = 3;

/** A portal {@link createNetherPortal} wrote. */
export interface CreatedPortal {
    /** The six-block interior, for the same placement an existing portal gets. */
    readonly rectangle: PortalRectangle;
    /** True when no footing was found and the portal floats on its own platform. */
    readonly forced: boolean;
}

/**
 * The vertical range a portal may be created in: from the dimension's floor to one past its
 * ceiling, where the ceiling is the lower of the client's height and Java's `logical_height`,
 * which is 128 for the Nether either way.
 */
export const creationBounds = (dimension: DimensionType): PortalCreationBounds => ({
    minY: dimension.minY,
    maxY: dimension.minY + Math.min(dimension.height, dimension.java.logicalHeight)
});

/**
 * Creates the portal a trip arrives in, as `PortalForcer.createPortal` does.
 *
 * @param world - The destination dimension, with the chunks around `target` loaded.
 * @param target - The scaled arrival block, from `scalePosition`.
 * @param axis - The source portal's axis, which the new portal keeps.
 * @returns The written interior and whether it was forced.
 */
export const createNetherPortal = (
    world: WorldActions,
    target: BlockPosition,
    axis: PortalAxis,
    dimension: DimensionType
): CreatedPortal => {
    const site = portalCreationSite(world, target, axis, creationBounds(dimension));
    writeNetherPortal(world, site.at, axis, site.forced);
    return {
        rectangle: {
            minCorner: new Vector3(site.at.x, site.at.y, site.at.z),
            axis,
            width: CREATED_WIDTH,
            height: CREATED_HEIGHT
        },
        forced: site.forced
    };
};
