import { Event } from '../Event';
import type Item from '../../item/Item';

export default class ItemRegisterEvent extends Event {
    private readonly item: Item;

    /**
     * Construct the event.
     * @param {Item} - - item The item that was registered.
     * @returns {ItemRegisterEvent} The event.
     * @constructor
     * @public
     */
    public constructor(item: Item) {
        super();
        this.item = item;
    }

    /**
     * Get the item that was registered.
     * @returns {Item} The item that was registered.
     * @public
     */
    public getItem(): Item {
        return this.item;
    }
}
