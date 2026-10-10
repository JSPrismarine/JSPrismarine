import ContainerEntry from './ContainerEntry';
import { Item } from '../item/Item';

/** An empty slot holds air rather than nothing, so that every slot has a position. */
const AIR = 'minecraft:air';

/**
 * Inventory.
 */
export default class Inventory {
    /**
     * What an empty slot holds.
     *
     * An empty *stack*, not a block of air. `new Air()` is a `Block`, and the two `as any`
     * casts it used to be forced through hid that a Block has no `networkSerialize` - so
     * anything writing a slot straight to the wire threw the moment the slot was empty, which
     * for armour is every player who has just joined.
     *
     * A fresh one each time rather than one shared: these go into slots, and a slot's contents
     * get mutated.
     */
    private static air(): Item {
        return new Item({ id: 0, name: AIR, meta: 0, count: 0 });
    }

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
            this.setItem(i, items[i] ?? new ContainerEntry({ item: Inventory.air() }));
        }
    }

    /**
     * The entry in a slot, rather than the thing it holds.
     *
     * Needed wherever a slot has to be written out: an entry knows how to become an item
     * stack, and what it holds may be a `Block` that does not.
     * @param {number} slot - the slot.
     * @returns {ContainerEntry | null} the entry, or `null` for a slot outside the container.
     */
    public getEntry(slot: number): ContainerEntry | null {
        return this.content.get(slot) ?? null;
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

        // By name, not by class: an empty slot is an air *item* now, and `instanceof Air`
        // only ever matched the Block that used to stand in for one.
        return Array.from(this.content.values()).filter((entry) => entry.getItem().getName() !== AIR);
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

    /** Whether a slot is free, which means it holds air rather than nothing. */
    public isEmpty(slot: number): boolean {
        const held = this.content.get(slot);

        return !held || held.getItem().getName() === AIR;
    }

    /** Whether two items would sit in one stack: the same thing, and not air. */
    private stacksWith(held: Item, incoming: Item): boolean {
        return held.getName() !== AIR && held.getName() === incoming.getName() && held.meta === incoming.meta;
    }

    /**
     * Puts a stack in, filling what is already there before taking a new slot.
     *
     * This used to look for a slot with nothing in it - `!this.content.has(i)` - and every
     * slot has something in it: an empty one holds air. The condition was never true, so the
     * method did nothing at all, and a stack picked up off the ground was taken out of the
     * world and put nowhere.
     *
     * Topping up first is not a nicety: without it sixty-four cobblestone picked up one at a
     * time fill sixty-four slots.
     * @param {ContainerEntry} entry - the stack to add.
     * @returns {number} how many items would not fit, zero when all of them did.
     */
    public addItem(entry: ContainerEntry): number {
        const incoming = entry.getItem();
        if (incoming.getName() === AIR) return 0;

        const max = Math.max(1, incoming.getMaxAmount());
        let remaining = Math.max(1, entry.getCount());

        for (let slot = 0; slot < this.slots && remaining > 0; slot++) {
            const held = this.content.get(slot);
            if (!held || !this.stacksWith(held.getItem(), incoming)) continue;

            const room = max - held.getCount();
            if (room <= 0) continue;

            const moved = Math.min(room, remaining);
            held.setCount(held.getCount() + moved);
            remaining -= moved;
        }

        for (let slot = 0; slot < this.slots && remaining > 0; slot++) {
            if (!this.isEmpty(slot)) continue;

            const moved = Math.min(max, remaining);
            // The entry itself when the whole thing goes in, so a tool keeps its class and
            // everything a subclass carries. Only a split needs a new stack built.
            const placed =
                moved === entry.getCount()
                    ? entry
                    : new ContainerEntry({
                          item: new Item({
                              id: incoming.getId(),
                              name: incoming.getName(),
                              meta: incoming.meta,
                              count: moved
                          }),
                          count: moved
                      });

            this.setItem(slot, placed);
            remaining -= moved;
        }

        return remaining;
    }

    /**
     * Returns the item in the slot.
     * @param {number} slot - the slot.
     * @returns {Item} the item in the slot, an empty air stack when there is nothing in it.
     */
    public getItem(slot: number): Item {
        if (this.content.has(slot)) {
            return this.content.get(slot)!.getItem()!;
        }

        return Inventory.air();
    }

    /**
     * Removes an item from a slot and returns it.
     * @param {number} slot - the slot.
     */
    public removeItem(slot: number) {
        if (!this.content.has(slot)) {
            return new ContainerEntry({ item: Inventory.air() });
        }

        const item = this.content.get(slot);
        // Air rather than nothing. Deleting left the slot absent from `content`, and the
        // inventory goes on the wire as a list whose position *is* the slot - so a container
        // one entry short moved every stack after the hole up by one.
        this.content.set(slot, new ContainerEntry({ item: Inventory.air() }));
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
