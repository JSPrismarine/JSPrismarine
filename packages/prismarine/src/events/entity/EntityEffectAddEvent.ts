import type { StoreActor } from '../../entity/data/storeActors';
import type { StatusEffectInput } from '../../entity/StatusEffect';
import { Event } from '../Event';

/**
 * Fired when a status effect is about to be applied to an entity, before it merges with one
 * already running. Cancellable, and the duration is writable. Script
 * `world.beforeEvents.effectAdd` subscribers see it here, and `entityEffectAdded` follows an
 * effect that changed what the entity has.
 */
export default class EntityEffectAddEvent extends Event {
    private readonly entity: StoreActor;
    private effect: StatusEffectInput;

    public constructor(entity: StoreActor, effect: StatusEffectInput) {
        super();
        this.entity = entity;
        this.effect = effect;
    }

    /** The entity the effect goes on. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** The effect as it will be applied. */
    public getEffect(): StatusEffectInput {
        return this.effect;
    }

    /** Changes how many ticks the effect lasts. */
    public setDuration(durationTicks: number): void {
        this.effect = { ...this.effect, durationTicks };
    }
}
