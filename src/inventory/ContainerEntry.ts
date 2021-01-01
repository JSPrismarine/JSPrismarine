import type Block from '../block/Block';
import type Item from '../item/Item';

export default class ContainerEntry {
    private item: Item | Block;
    private count: number;

    constructor({ item, count = 0 }: { item: Item | Block; count?: number }) {
        this.item = item;
        this.count = count;
    }

    public getItem() {
        return this.item;
    }

    public getCount() {
        return this.count;
    }
}
