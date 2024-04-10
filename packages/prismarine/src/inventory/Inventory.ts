import Air from '../block/blocks/Air';
import ContainerEntry from './ContainerEntry';
import type { Item } from '../item/Item';

/**
 * Inventory.
 */
export default class Inventory {
    /**
     * Number of slots.
     * @private
     */
    private readonly slots: number;

    /**
     * <Slot number, Item in the slot>
     * @private
     */
    private readonly content: Map<number, ContainerEntry> = new Map() as Map<number, ContainerEntry>;

    public constructor(slots = 0, items: ContainerEntry[] = []) {
        this.slots = slots;
        this.setItems(items);
    }

    /**
     * Get window id.
     * @todo: implement this.
     */
    public getId(): number {
        return 0;
    }

    /**
     * Adds an array of items into the inventory.
     * @param {ContainerEntry[]} [items=[]] - the entires.
     */
    public setItems(items: ContainerEntry[] = []) {
        if (items.length > this.slots) {
            // If the inventory slots are less than items cut the items array.
            items = items.slice(0, this.slots);
        }

        for (let i = 0; i < this.getSlotCount(); i++) {
            this.setItem(i, items[i] ?? new ContainerEntry({ item: new Air() as any as Item }));
        }
    }

    /**
     * Returns all the items inside the inventory.
     * @param {boolean} [includeAir=false] - if air should be accounted for.
     * @returns {ContainerEntry[]} the entries.
     */
    public getItems(includeAir = false): ContainerEntry[] {
        if (includeAir) {
            return Array.from(this.content.values());
        }

        return Array.from(this.content.values()).filter((item) => !(item.getItem() instanceof Air));
    }

    /**
     * Sets an item in the inventory content.
     * @param {number} slot - the slot.
     * @param {ContainerEntry} item - the item.
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
     * @param {ContainerEntry} item - the item.
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
     * @param {number} slot - the slot.
     * @returns {Item | Air} the item in the slot.
     */
    public getItem(slot: number): Item {
        if (this.content.has(slot)) {
            return this.content.get(slot)!.getItem()!;
        }
        return new Air() as any as Item;
    }

    /**
     * Removes an item from a slot and returns it.
     * @param {number} slot - the slot.
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
     * @returns {number} the slot count.
     */
    public getSlotCount(): number {
        return this.slots;
    }
}
