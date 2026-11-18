import type { SpawnCause } from '@jsprismarine/entities/eventEngine';

import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/** Why an entity entered its world: a {@link SpawnCause}, or `loaded` from a save. */
export type EntitySpawnCause = SpawnCause | 'loaded';

/**
 * Fired once an entity other than a player has entered its world, after its spawn event ran and
 * its body was made, whether it was spawned, born, transformed, primed or loaded from a save. A
 * player's arrival is `playerSpawn`.
 *
 * Not cancellable: by then the entity is in the store and clients may have been shown it. A
 * listener that does not want it can remove it.
 */
export default class EntitySpawnEvent extends Event {
    private readonly entity: StoreActor;
    private readonly cause: EntitySpawnCause;

    public constructor(entity: StoreActor, cause: EntitySpawnCause) {
        super();

        this.entity = entity;
        this.cause = cause;
    }

    /** The entity that appeared, through its actor. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** Why it appeared. */
    public getCause(): EntitySpawnCause {
        return this.cause;
    }
}
