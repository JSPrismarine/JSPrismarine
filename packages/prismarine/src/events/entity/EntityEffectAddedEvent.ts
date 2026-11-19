import type { StoreActor } from '../../entity/data/storeActors';
import type { StatusEffect } from '../../entity/StatusEffect';
import { Event } from '../Event';

/**
 * Fired once a status effect was added to an entity or changed one it had. Script
 * `world.afterEvents.effectAdd` subscribers hear it in the tick's script flush.
 */
export default class EntityEffectAddedEvent extends Event {
    private readonly entity: StoreActor;
    private readonly effect: StatusEffect;

    public constructor(entity: StoreActor, effect: StatusEffect) {
        super();
        this.entity = entity;
        this.effect = effect;
    }

    /** The entity the event is about, through its actor. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** The effect the entity has now. */
    public getEffect(): StatusEffect {
        return this.effect;
    }
}
