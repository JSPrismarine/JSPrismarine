import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired when a player uses the item in their hand on nothing, before the item acts. Cancellable:
 * a canceled use runs none of the item's behavior. Script `world.beforeEvents.itemUse`
 * subscribers see it here, and `playerItemUsed` follows a use that went on.
 */
export default class PlayerUseItemEvent extends Event {
    private readonly player: bigint;
    private readonly world: World;
    private readonly item: Item;

    public constructor(player: bigint, world: World, item: Item) {
        super();

        this.player = player;
        this.world = world;
        this.item = item;
    }

    /** The runtime id of the player using the item. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world the player is in. */
    public getWorld(): World {
        return this.world;
    }

    /** The stack being used. */
    public getItem(): Item {
        return this.item;
    }
}
