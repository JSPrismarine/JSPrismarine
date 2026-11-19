import type { HealCause } from '../../entity/data/EntityRuntime';
import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired when an entity is about to heal, before its health changes. Cancellable, and the amount
 * is writable; anything at or below zero heals nothing. Script `world.beforeEvents.entityHeal`
 * subscribers see it here, and `entityHealed` follows a heal that gave health.
 */
export default class EntityHealEvent extends Event {
    private readonly entity: StoreActor;
    private amount: number;
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

    /** The health the heal gives, before the maximum caps it. */
    public getAmount(): number {
        return this.amount;
    }

    /** Changes the health the heal gives. */
    public setAmount(amount: number): void {
        this.amount = amount;
    }

    /** Why the entity heals. */
    public getCause(): HealCause {
        return this.cause;
    }
}
