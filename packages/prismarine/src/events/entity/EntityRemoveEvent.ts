import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired as an entity other than a player is about to leave its world, while it still answers:
 * killed and gone, despawned, discarded or unloaded with its chunk. Not cancellable. Script
 * `world.beforeEvents.entityRemove` subscribers see it here, and `entityRemoved` follows.
 */
export default class EntityRemoveEvent extends Event {
    private readonly entity: StoreActor;
    private readonly reason: string;

    public constructor(entity: StoreActor, reason: string) {
        super();
        this.entity = entity;
        this.reason = reason;
    }

    /** The entity about to leave, through its actor. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** Why it leaves, such as `chunk unload`. */
    public getReason(): string {
        return this.reason;
    }
}
