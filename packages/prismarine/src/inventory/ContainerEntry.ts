import type { Block } from '../block/';
import { Item } from '../item/Item';

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
    /**
     * The entry as an item stack, which is the only form the wire has.
     *
     * A slot may hold a `Block` rather than an `Item` - every empty one holds air, which is a
     * block - and {@link getItem} casts one to the other rather than converting it. The cast
     * is a lie that only shows when something calls a method a `Block` does not have, and
     * `networkSerialize` is such a method: sending an inventory threw on its first empty slot,
     * which is why the send sat commented out instead of working.
     * @returns {Item} an item stack naming the same thing.
     */
    public toItemStack(): Item {
        if (this.item instanceof Item) return this.item;

        return new Item({ id: this.item.getId(), name: this.item.getName(), count: Math.max(1, this.count) });
    }

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
