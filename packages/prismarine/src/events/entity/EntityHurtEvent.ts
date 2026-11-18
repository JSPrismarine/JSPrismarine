import type { DamageSource } from '../../entity/DamageSource';
import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired once a blow has landed on an entity, after the unit it is in has kept its writes, and
 * before an `entityDeath` the same blow causes.
 *
 * Where `entityDamage` offers the raw blow before anything happened, this reports what landed:
 * the blow after the grace period, which a stronger hit inside it shortens to the difference.
 * Not cancellable, as the health is already gone.
 */
export default class EntityHurtEvent extends Event {
    private readonly entity: StoreActor;
    private readonly damage: number;
    private readonly source: DamageSource;

    public constructor(entity: StoreActor, damage: number, source: DamageSource) {
        super();

        this.entity = entity;
        this.damage = damage;
        this.source = source;
    }

    /** Who was hurt, through its actor. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** The blow after the grace period and before armor. */
    public getDamage(): number {
        return this.damage;
    }

    /** What did it, and who is answerable for it. */
    public getSource(): DamageSource {
        return this.source;
    }
}
