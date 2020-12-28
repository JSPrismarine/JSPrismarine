import Air from '../block/blocks/Air';
import Item from '../item/Item';

// TODO: viewer logic
export default class Inventory {
    private readonly slots: number;
    /**
     * (Slot number - Item in the slot)
     */
    private readonly content: Map<number, Item> = new Map();

    public constructor(slots = 0, items: Item[] = []) {
        this.slots = slots;
        this.setItems(items);
    }

    /**
     * Adds an array of items into the inventory.
     */
    public setItems(items: Item[] = []) {
        if (items.length > this.slots) {
            // If the inventory slots are less
            // than items cut the items array
            items = items.slice(0, this.slots);
        }

        for (let i = 0; i < this.getSlotCount(); i++) {
            this.setItem(i, items[i] ?? new Air());
        }
    }

    /**
     * Returns all the items inside the inventory.
     */
    public getItems(includeAir = false): Item[] {
        if (includeAir) {
            return Array.from(this.content.values());
        }

        return Array.from(this.content.values()).filter(
            (item) => !(item instanceof Air)
        );
    }

    /**
     * Sets an item in the inventory content.
     */
    public setItem(slot: number, item: Item) {
        if (slot > this.slots) {
            return false;
        }

        this.content.set(slot, item);
        return true;
    }

    /**
     * Returns the item in the slot.
     */
    public getItem(slot: number) {
        if (this.content.has(slot)) {
            return this.content.get(slot);
        }

        return new Air();
    }

    /**
     * Removes an item from a slot and returns it.
     */
    public removeItem(slot: number) {
        if (!this.content.has(slot)) {
            return new Air();
        }

        const item = this.content.get(slot);
        this.content.delete(slot);
        return item;
    }

    /**
     * Returns the slot count of the inventory.
     */
    public getSlotCount(): number {
        return this.slots;
    }
}
