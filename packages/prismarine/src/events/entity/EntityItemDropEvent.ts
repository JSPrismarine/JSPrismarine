import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired once a player dropped stacks and they lie in the world as item entities. Script
 * `world.afterEvents.entityItemDrop` subscribers hear it in the tick's script flush.
 */
export default class EntityItemDropEvent extends Event {
    public constructor(
        private readonly dropper: bigint,
        private readonly world: World,
        private readonly entities: readonly bigint[],
        private readonly items: readonly Item[]
    ) {
        super();
    }

    /** The runtime id of who dropped them. */
    public getDropper(): bigint {
        return this.dropper;
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** The runtime ids of the item entities the stacks became. */
    public getEntities(): readonly bigint[] {
        return this.entities;
    }

    /** The stacks dropped. */
    public getItems(): readonly Item[] {
        return this.items;
    }
}
