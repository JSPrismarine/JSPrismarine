import type { StoreActor } from '../../entity/data/storeActors';
import { Event } from '../Event';

/**
 * Fired when an entity's melee swing reaches another entity: a player's attack in reach, or a
 * mob's attack goal connecting, whether or not the blow then takes health. Script
 * `world.afterEvents.entityHitEntity` subscribers hear it in the tick's script flush.
 */
export default class EntityHitEntityEvent extends Event {
    private readonly attacker: StoreActor;
    private readonly target: StoreActor;

    public constructor(attacker: StoreActor, target: StoreActor) {
        super();
        this.attacker = attacker;
        this.target = target;
    }

    /** Who swung. */
    public getAttacker(): StoreActor {
        return this.attacker;
    }

    /** What the swing reached. */
    public getTarget(): StoreActor {
        return this.target;
    }
}
