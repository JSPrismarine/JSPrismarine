import type { Item } from '../../item/Item';
import type { World } from '../../world/World';
import { Event } from '../Event';

/**
 * Fired once a player's use of an item went past `playerUseItem`, whether or not the item has a
 * behavior of its own. Not cancellable. Script `world.afterEvents.itemUse` subscribers see it here.
 */
export default class PlayerItemUsedEvent extends Event {
    private readonly player: bigint;
    private readonly world: World;
    private readonly item: Item;

    public constructor(player: bigint, world: World, item: Item) {
        super();

        this.player = player;
        this.world = world;
        this.item = item;
    }

    /** The runtime id of the player who used the item. */
    public getPlayer(): bigint {
        return this.player;
    }

    /** The world the player is in. */
    public getWorld(): World {
        return this.world;
    }

    /** The stack used, as it was before it acted. */
    public getItem(): Item {
        return this.item;
    }
}
