import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired when an entity is about to be tamed, once the taming roll won and before the tamer owns
 * it. Cancellable: a canceled taming leaves the entity wild. Script
 * `world.beforeEvents.entityTamed` subscribers see it here, and `entityTamed` follows.
 */
export default class EntityTameEvent extends Event {
    public constructor(
        private readonly entity: StoreActor,
        private readonly tamer: StoreActor
    ) {
        super();
    }

    /** The entity being tamed. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** Who tames it. */
    public getTamer(): StoreActor {
        return this.tamer;
    }
}
