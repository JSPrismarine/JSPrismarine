import type { Item } from '../../item/Item';
import PlayerInteractEntityEvent from './PlayerInteractEntityEvent';

/**
 * Fired once a player's click on an entity went past `playerInteractEntity` and did something,
 * such as feeding it or using the item in hand on it. Not cancellable. Script
 * `world.afterEvents.playerInteractWithEntity` subscribers see it here.
 */
export default class PlayerEntityInteractedEvent extends PlayerInteractEntityEvent {
    private readonly itemAfter: Item | null;

    public constructor(click: PlayerInteractEntityEvent, itemAfter: Item | null) {
        super(click.getPlayer(), click.getWorld(), click.getTarget(), click.getItem());

        this.itemAfter = itemAfter;
    }

    /** The stack in the player's hand after the click, or null for an empty hand. */
    public getItemAfter(): Item | null {
        return this.itemAfter;
    }
}
