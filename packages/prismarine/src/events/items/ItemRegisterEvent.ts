import { Event } from '../Event';
import type { Item } from '../../item/Item';

export default class ItemRegisterEvent extends Event {
    private readonly item: Item;

    /**
     * Construct the event.
     * @param {Item} item - item The item that was registered.
     * @returns {ItemRegisterEvent} The event.
     * @constructor
     */
    public constructor(item: Item) {
        super();
        this.item = item;
    }

    /**
     * Get the item that was registered.
     * @returns {Item} The item that was registered.
     */
    public getItem(): Item {
        return this.item;
    }
}
