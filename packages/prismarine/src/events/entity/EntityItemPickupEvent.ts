import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired when a player is about to pick up a dropped stack, before anything moves into their
 * inventory. Cancellable: a canceled pickup leaves the stack on the ground. Script
 * `world.beforeEvents.entityItemPickup` subscribers see it here, and `entityItemPickedUp`
 * follows a pickup that took something.
 */
export default class EntityItemPickupEvent extends Event {
    public constructor(
        private readonly taker: bigint,
        private readonly world: World,
        private readonly itemEntity: bigint,
        private readonly item: Item
    ) {
        super();
    }

    /** The runtime id of the player picking it up. */
    public getTaker(): bigint {
        return this.taker;
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** The runtime id of the item entity on the ground. */
    public getItemEntity(): bigint {
        return this.itemEntity;
    }

    /** The stack it holds. */
    public getItem(): Item {
        return this.item;
    }
}
