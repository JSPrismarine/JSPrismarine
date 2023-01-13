import Event from '../Event.js';
import type Item from '../../item/Item.js';

export default class ItemRegisterEvent extends Event {
    private readonly item;

    public constructor(item: Item) {
        super();
        this.item = item;
    }

    public getItem(): Item {
        return this.item;
    }
}
