import type { PortalBlockRef } from '../../world/portal/DimensionTravel';
import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired when an entity's body first overlaps a portal block, before any contact timer starts.
 *
 * Cancelable. A canceled event opens no contact, so the entity stays where it is; the world
 * asks again on the next tick it still overlaps the portal. Players raise this too, and then
 * `PlayerChangeDimensionEvent` once their timer runs out and a destination is known.
 */
export default class EntityPortalEnterEvent extends Event {
    private readonly entity: StoreActor;
    private readonly portal: PortalBlockRef;

    public constructor(entity: StoreActor, portal: PortalBlockRef) {
        super();

        this.entity = entity;
        this.portal = portal;
    }

    /** Who stepped into the portal: a legacy entity, or a store entity through its actor. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** The portal block the entity overlaps, with the world it is in. */
    public getPortal(): PortalBlockRef {
        return this.portal;
    }
}
