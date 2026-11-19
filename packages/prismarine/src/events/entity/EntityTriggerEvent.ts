import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired as a data-driven entity's event, such as `minecraft:become_adult`, applies to it, with
 * the component groups it adds and removes. Script `world.afterEvents.dataDrivenEntityTrigger`
 * subscribers hear it in the tick's script flush.
 */
export default class EntityTriggerEvent extends Event {
    public constructor(
        private readonly entity: StoreActor,
        private readonly eventId: string,
        private readonly added: readonly string[],
        private readonly removed: readonly string[]
    ) {
        super();
    }

    /** The entity the event applies to. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** The event's name. */
    public getEventId(): string {
        return this.eventId;
    }

    /** The component groups it adds. */
    public getAdded(): readonly string[] {
        return this.added;
    }

    /** The component groups it removes. */
    public getRemoved(): readonly string[] {
        return this.removed;
    }
}
