import type { Item } from '../item/';
import type { Block } from '../block/';

export default class ContainerEntry {
    private item: Item | Block;
    private count: number;

    public constructor({ item, count = 0 }: { item: Item | Block; count?: number }) {
        this.item = item;
        this.count = count;
    }

    /**
     * Get the item.
     * @returns {Item} the item.
     */
    public getItem(): Item {
        return this.item as Item; // FIXME: this ain't right.
    }

    /**
     * Get the amount of items.
     * @returns {number} the count.
     */
    public getCount(): number {
        return this.count;
    }

    /**
     * Set the amount of items.
     * @param {number} count - set the count.
     */
    public setCount(count: number) {
        this.count = count;
    }
}
