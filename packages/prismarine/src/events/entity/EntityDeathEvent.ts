import type { DamageSource } from '../../entity/DamageSource';
import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired once, when an entity's health has reached zero.
 *
 * It is posted once the unit of the killing blow has kept its writes, so a blow that a later
 * failure in the same unit took back posts nothing. By then a mob that died is out of the world:
 * {@link EntityDeathEvent.getEntity} still answers its type, name, position and equipment as they
 * were when it died, though the world no longer finds it by its runtime id.
 *
 * Not cancellable: by the time this runs the health is already gone and the client has been told,
 * so a listener that "canceled" it would leave a corpse walking around with no hearts. What it
 * is for is reacting - loot, statistics, an announcement - and for that, knowing who did it is
 * the whole point, which is why the source is carried rather than only the cause.
 */
export default class EntityDeathEvent extends Event {
    private readonly entity: StoreActor;
    private readonly source: DamageSource;

    public constructor(entity: StoreActor, source: DamageSource) {
        super();

        this.entity = entity;
        this.source = source;
    }

    /** Who died: a store entity, through its actor. */
    public getEntity(): StoreActor {
        return this.entity;
    }

    /** What killed them, and who is answerable for it. */
    public getSource(): DamageSource {
        return this.source;
    }
}
