import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired once a player took a dropped stack, or the part of it that fit. Script
 * `world.afterEvents.entityItemPickup` subscribers hear it in the tick's script flush.
 */
export default class EntityItemPickedUpEvent extends Event {
    public constructor(
        private readonly taker: bigint,
        private readonly world: World,
        private readonly item: Item
    ) {
        super();
    }

    /** The runtime id of the player who took it. */
    public getTaker(): bigint {
        return this.taker;
    }

    /** The world it happened in. */
    public getWorld(): World {
        return this.world;
    }

    /** The stack as much of it as went into the inventory. */
    public getItem(): Item {
        return this.item;
    }
}
