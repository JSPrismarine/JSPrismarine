import type { EntityPosition as Vector3Like } from '@jsprismarine/entities';

import type { StoreActor } from '../../entity/data/storeActors';
import type { World } from '../../world/World';
import { Event } from '../Event';

/** What a projectile reached: an entity, or a block position. */
export type ProjectileHitTarget = { readonly entity: StoreActor } | { readonly block: Vector3Like };

/**
 * Fired when a projectile reaches an entity or a block, before the hit hurts, sticks or breaks
 * anything. Script `world.afterEvents.projectileHitEntity` and `projectileHitBlock` subscribers
 * hear it in the tick's script flush.
 */
export default class ProjectileHitEvent extends Event {
    public constructor(
        private readonly world: World,
        private readonly projectile: StoreActor,
        private readonly owner: StoreActor | null,
        private readonly target: ProjectileHitTarget,
        private readonly location: Vector3Like,
        private readonly velocity: Vector3Like
    ) {
        super();
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** The projectile. */
    public getProjectile(): StoreActor {
        return this.projectile;
    }

    /** Who threw or shot it, or null for none. */
    public getOwner(): StoreActor | null {
        return this.owner;
    }

    /** What it reached. */
    public getTarget(): ProjectileHitTarget {
        return this.target;
    }

    /** Where the projectile was as it hit. */
    public getLocation(): Vector3Like {
        return this.location;
    }

    /** The projectile's motion as it hit. */
    public getVelocity(): Vector3Like {
        return this.velocity;
    }
}
