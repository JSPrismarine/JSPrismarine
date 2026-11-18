import type { Item } from '../../item/Item';
import PlayerInteractBlockEvent from './PlayerInteractBlockEvent';

/**
 * Fired once a player's click on a block went past `playerInteractBlock` and did something: a
 * block or a screen took it, the item in hand was used on the block, or the item placed one. Not
 * cancellable. Script `world.afterEvents.playerInteractWithBlock` subscribers see it here.
 */
export default class PlayerBlockInteractedEvent extends PlayerInteractBlockEvent {
    private readonly itemAfter: Item | null;

    public constructor(click: PlayerInteractBlockEvent, itemAfter: Item | null) {
        super(
            click.getPlayer(),
            click.getWorld(),
            click.getBlock(),
            click.getFace(),
            click.getFaceLocation(),
            click.getItem()
        );

        this.itemAfter = itemAfter;
    }

    /** The stack in the player's hand after the click, or null for an empty hand. */
    public getItemAfter(): Item | null {
        return this.itemAfter;
    }
}
