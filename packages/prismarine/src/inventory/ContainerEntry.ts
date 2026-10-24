import type { Item } from '../item/Item';

/** One inventory slot: an item stack and how many of it there are. */
export default class ContainerEntry {
    private item: Item;
    private count: number;

    public constructor({ item, count = 0 }: { item: Item; count?: number }) {
        this.item = item;
        this.count = count;
    }

    /**
     * Get the item.
     * @returns {Item} the item.
     */
    public getItem(): Item {
        return this.item;
    }

    /**
     * The entry as an item stack, which is the only form the wire has.
     *
     * An entry only ever holds an `Item`, so this is the item itself. Kept because callers
     * that write a slot to the wire ask for a stack rather than for the slot's contents.
     * @returns {Item} the item stack.
     */
    public toItemStack(): Item {
        return this.item;
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
