import Air from '../block/blocks/Air.js';
import ContainerEntry from './ContainerEntry.js';
import Item from '../item/Item.js';

/**
 * Inventory.
 *
 * @public
 */
export default class Inventory {
    private readonly slots: number;
    /**
     * (Slot number - Item in the slot)
     */
    private readonly content: Map<number, ContainerEntry> = new Map() as Map<number, ContainerEntry>;

    public constructor(slots = 0, items: ContainerEntry[] = []) {
        this.slots = slots;
        this.setItems(items);
    }

    /**
     * Get window id.
     *
     * TODO: implement this
     */
    public getId(): number {
        return 0;
    }

    /**
     * Adds an array of items into the inventory.
     */
    public setItems(items: ContainerEntry[] = []) {
        if (items.length > this.slots) {
            // If the inventory slots are less
            // than items cut the items array
            items = items.slice(0, this.slots);
        }

        for (let i = 0; i < this.getSlotCount(); i++) {
            this.setItem(i, items[i] ?? new ContainerEntry({ item: new Air() as any as Item }));
        }
    }

    /**
     * Returns all the items inside the inventory.
     */
    public getItems(includeAir = false): ContainerEntry[] {
        if (includeAir) {
            return Array.from(this.content.values());
        }

        return Array.from(this.content.values()).filter((item) => !(item.getItem() instanceof Air));
    }

    /**
     * Sets an item in the inventory content.
     */
    public setItem(slot: number, item: ContainerEntry) {
        if (slot > this.slots) {
            return false;
        }

        this.content.set(slot, item);
        return true;
    }

    /**
     * Add an item to the first available slot
     */
    public addItem(item: ContainerEntry) {
        for (let i = 0; i < this.slots; i++)
            if (!this.content.has(i)) {
                this.setItem(i, item);
                return;
            }
    }

    /**
     * Returns the item in the slot.
     */
    public getItem(slot: number): Item {
        if (this.content.has(slot)) {
            return this.content.get(slot)!.getItem();
        }
        return new Air() as any as Item;
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
