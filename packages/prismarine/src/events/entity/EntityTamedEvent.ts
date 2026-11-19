import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired once an entity was tamed and its tamer owns it. Script `world.afterEvents.entityTamed`
 * subscribers hear it in the tick's script flush.
 */
export default class EntityTamedEvent extends Event {
    public constructor(
        private readonly entity: StoreActor,
        private readonly tamer: StoreActor
    ) {
        super();
    }

    /** The entity tamed. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** Who tamed it. */
    public getTamer(): StoreActor {
        return this.tamer;
    }
}
