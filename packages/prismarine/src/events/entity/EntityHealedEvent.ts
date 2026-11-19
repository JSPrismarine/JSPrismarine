import type { HealCause } from '../../entity/data/EntityRuntime';
import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired once an entity healed. Script `world.afterEvents.entityHeal` subscribers hear it in the
 * tick's script flush.
 */
export default class EntityHealedEvent extends Event {
    private readonly entity: StoreActor;
    private readonly amount: number;
    private readonly cause: HealCause;

    public constructor(entity: StoreActor, amount: number, cause: HealCause) {
        super();
        this.entity = entity;
        this.amount = amount;
        this.cause = cause;
    }

    /** The entity the event is about, through its actor. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** The health the heal gave, before the maximum capped it. */
    public getAmount(): number {
        return this.amount;
    }

    /** Why the entity heals. */
    public getCause(): HealCause {
        return this.cause;
    }
}
