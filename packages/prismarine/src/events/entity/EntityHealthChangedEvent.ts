import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired once an entity's health changed, whatever changed it: a blow, a heal, a command or a
 * script. Script `world.afterEvents.entityHealthChanged` subscribers hear it in the tick's
 * script flush.
 */
export default class EntityHealthChangedEvent extends Event {
    private readonly entity: StoreActor;
    private readonly before: number;
    private readonly after: number;

    public constructor(entity: StoreActor, before: number, after: number) {
        super();
        this.entity = entity;
        this.before = before;
        this.after = after;
    }

    /** The entity the event is about, through its actor. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** The health before the change. */
    public getBefore(): number {
        return this.before;
    }

    /** The health after the change. */
    public getAfter(): number {
        return this.after;
    }
}
