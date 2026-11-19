import type { StoreActor } from '../../entity/data/storeActors';
import type { Item } from '../../item/Item';
import { Event } from '../Event';

/**
 * Fired when a player swings at an entity with what they hold, before the reach is measured and
 * before any damage. Cancellable: a canceled swing does nothing. Script
 * `world.beforeEvents.playerItemAttackEntity` subscribers see it here.
 */
export default class PlayerAttackEntityEvent extends Event {
    private readonly player: StoreActor;
    private readonly target: StoreActor;
    private readonly item: Item | null;

    public constructor(player: StoreActor, target: StoreActor, item: Item | null) {
        super();
        this.player = player;
        this.target = target;
        this.item = item;
    }

    /** The player swinging. */
    public getPlayer(): StoreActor {
        return this.player;
    }

    /** What they swing at. */
    public getTarget(): StoreActor {
        return this.target;
    }

    /** What they hold, or null for an empty hand. */
    public getItem(): Item | null {
        return this.item;
    }
}
