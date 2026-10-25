import type { EntityInstance, EntityPosition } from '@jsprismarine/entities';

/**
 * The heading the slime line's goals share.
 *
 * A slime has no walk. It moves by hopping, and in vanilla the four goals of
 * the line all talk to one `SlimeMoveControl` on the mob rather than to each
 * other: `slime_random_direction` and `slime_attack` set the direction,
 * `slime_keep_on_jumping` and `slime_float` ask for the movement. This module
 * is that shared piece. Without it `slime_keep_on_jumping` has a jump and no
 * direction to spend it on, which is a slime that bounces where it stands.
 *
 * The heading is kept per entity rather than per goal because each goal
 * component builds its own {@link import('../support').GoalSupport}, so two
 * goals on one slime share nothing else.
 */

/** Where one slime is heading. */
export class SlimeHeading {
    /** The heading in radians, as `Math.atan2(dz, dx)` measures one. */
    private radians: number | undefined;

    /** Points the slime along a heading, in radians. */
    public set(radians: number): void {
        this.radians = radians;
    }

    /** Points the slime from one position at another, which is what chasing a target is. */
    public toward(from: EntityPosition, to: EntityPosition): void {
        this.radians = Math.atan2(to.z - from.z, to.x - from.x);
    }

    /**
     * Where one hop along the heading lands.
     *
     * @param from - Where the slime is now.
     * @param reach - How far one hop carries it, in blocks.
     * @returns The position, or undefined while nothing has set a heading yet.
     */
    public ahead(from: EntityPosition, reach: number): EntityPosition | undefined {
        if (this.radians === undefined) return undefined;
        return {
            x: from.x + Math.cos(this.radians) * reach,
            y: from.y,
            z: from.z + Math.sin(this.radians) * reach
        };
    }
}

const headings = new WeakMap<EntityInstance, SlimeHeading>();

/**
 * The heading one slime's goals share, created on the first goal that asks.
 *
 * @param entity - The slime, which is the key the goals of one mob meet on.
 */
export const slimeHeadingOf = (entity: EntityInstance): SlimeHeading => {
    const known = headings.get(entity);
    if (known !== undefined) return known;

    const heading = new SlimeHeading();
    headings.set(entity, heading);
    return heading;
};

/** How far one hop carries a slime, in blocks. */
export const SLIME_HOP_REACH = 4;
