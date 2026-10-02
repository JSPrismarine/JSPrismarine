import { Vector3 } from '@jsprismarine/math';
import type { Mob } from '../../Mob';
import type { Goal } from '../Goal';
import { GoalLane } from '../Goal';

/**
 * Getting out of the water.
 *
 * The highest priority thing a land mob does, because everything else assumes it is standing on
 * something. A mob that walked into a river and carried on strolling would keep trying to path
 * along a river bed it cannot stand on, and would look like it was drowning rather than swimming.
 *
 * Buoyancy itself is physics and lives in `Mob`; this is only the decision to head for dry land.
 */

/** How far to look for a bank. */
const SHORE_SEARCH = 8;

export class FloatGoal implements Goal {
    public readonly name = 'float';
    public readonly priority = 1;
    public readonly lanes = [GoalLane.Move, GoalLane.Body];

    public canUse(mob: Mob): boolean {
        const position = mob.getPosition();

        return mob
            .getBlockView()
            .isSubmerged(Math.floor(position.getX()), Math.floor(position.getY()), Math.floor(position.getZ()));
    }

    public start(mob: Mob): void {
        const shore = this.findShore(mob);
        if (shore) mob.moveTo(shore);
    }

    public stop(mob: Mob): void {
        mob.stopMoving();
    }

    public tick(): void {
        // Staying afloat is the physics' business; this goal only has to hold the lanes so nothing
        // else tries to walk the mob further out.
    }

    /** The nearest dry block to strike out for, searched in rings so the closest wins. */
    private findShore(mob: Mob): Vector3 | null {
        const view = mob.getBlockView();
        const position = mob.getPosition();
        const originX = Math.floor(position.getX());
        const originY = Math.floor(position.getY());
        const originZ = Math.floor(position.getZ());

        for (let radius = 2; radius <= SHORE_SEARCH; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    // Only the ring itself; the inside was covered by a smaller radius.
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;

                    const x = originX + dx;
                    const z = originZ + dz;
                    const y = view.groundBelow(x, originY + 2, z, 4);

                    if (y === null || view.isLiquid(x, y, z)) continue;
                    return new Vector3(x + 0.5, y, z + 0.5);
                }
            }
        }

        return null;
    }
}

export default FloatGoal;
