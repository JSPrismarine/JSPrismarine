import type Item from '../item/Item.js';

export default class ContainerEntry {
    private item: Item;
    private count: number;

    public constructor({ item, count = 0 }: { item: Item; count?: number }) {
        this.item = item;
        this.count = count;
    }

    public getItem() {
        return this.item;
    }

    public getCount() {
        return this.count;
    }

    public setCount(count: number) {
        this.count = count;
    }
}
