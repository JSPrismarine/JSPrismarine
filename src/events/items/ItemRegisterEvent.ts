import type Item from '../../item/Item';
import Event from '../Event';

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
