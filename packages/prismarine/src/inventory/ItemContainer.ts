import type { SlotObserver, SlotValue } from './slotLog';
import { slotValueOf } from './slotLog';
import type { Item } from '../item/Item';

/** The name an empty stack goes by on the wire, which a slot never holds. */
const AIR = 'minecraft:air';

/** Whether a stack is nothing at all: air, or a count of zero or less. */
const isNothing = (item: Item): boolean => item.getName() === AIR || item.getAmount() <= 0;

/** Whether two stacks would sit in one slot: the same item with the same aux value. */
const stacksWith = (held: Item, incoming: Item): boolean =>
    held.getName() === incoming.getName() && held.meta === incoming.meta;

/**
 * A fixed row of item slots, each holding an `Item` or nothing.
 *
 * A slot's count is the count on its `Item`. Writing air, or a stack of zero or fewer, empties
 * the slot, so an empty slot is `null` and never a placeholder stack. Code that needs air on the
 * wire builds it there with `Item.air()`.
 *
 * Every write goes through {@link ItemContainer.set}, {@link ItemContainer.add},
 * {@link ItemContainer.clear} or {@link ItemContainer.resize}, and each one replaces the stack in
 * the slot. A stack changed in place is not a write: change a copy and set it. The one exception
 * is the stack network id, which is the client's name for a stack and not part of its saved form.
 */
export class ItemContainer {
    private readonly slots: (Item | null)[];

    /** Hears every slot write once an owner that logs its slots has called {@link ItemContainer.observe}. */
    private observer: SlotObserver | null = null;

    /**
     * Each slot's value as the observer last heard it, so a write reports the value the slot had
     * when it was last logged and not one that a change to the stack in place has already moved.
     */
    private readonly logged: SlotValue[] = [];

    /**
     * @param size - How many slots. An owner can change it later with {@link ItemContainer.resize}.
     * @param items - What the first slots hold. Anything past `size` is left out.
     */
    public constructor(size: number, items: readonly (Item | null)[] = []) {
        this.slots = Array.from({ length: Math.max(0, size) }, (_unused, slot) => {
            const item = items[slot] ?? null;
            return item === null || isNothing(item) ? null : item;
        });
    }

    /** How many slots the container has. */
    public get size(): number {
        return this.slots.length;
    }

    /**
     * Reports every later write to a slot, with the slot's logged value before and after it,
     * which is how an entity's inventory reaches the change log.
     * @param observer - Hears each write. It replaces any observer set before.
     */
    public observe(observer: SlotObserver): void {
        this.observer = observer;
        this.logged.length = 0;
        for (const item of this.slots) this.logged.push(slotValueOf(item));
    }

    /** Whether a slot number is a whole number inside the container. */
    public has(slot: number): boolean {
        return Number.isInteger(slot) && slot >= 0 && slot < this.slots.length;
    }

    /**
     * The stack in a slot, as it is stored and not a copy.
     * @returns The stack, or null for an empty slot or a slot outside the container.
     */
    public get(slot: number): Item | null {
        return this.has(slot) ? (this.slots[slot] ?? null) : null;
    }

    /**
     * Puts a stack in a slot, replacing what was there.
     * @param item - The stack. Null, air or a count of zero or less empties the slot.
     * @returns Whether the slot is inside the container. A slot outside it is left alone.
     */
    public set(slot: number, item: Item | null): boolean {
        if (!this.has(slot)) return false;

        this.slots[slot] = item === null || isNothing(item) ? null : item;
        this.written(slot);
        return true;
    }

    /** Whether a slot holds nothing. A slot outside the container counts as empty. */
    public isEmpty(slot: number): boolean {
        return this.get(slot) === null;
    }

    /**
     * Puts a stack in, topping up matching stacks before taking an empty slot.
     *
     * Topping up first means sixty-four cobblestone picked up one at a time fill one slot and
     * not sixty-four. A grown stack is a copy of the one in the slot at its new size, so it keeps
     * its own enchantments, durability and name. The stack goes into an empty slot as it is when
     * all of it fits there, and as a copy at the size that fits when it is split.
     * @param item - The stack to add. Air adds nothing, and a count below one adds one.
     * @returns How many items did not fit, zero when all of them did.
     */
    public add(item: Item): number {
        if (item.getName() === AIR) return 0;

        const max = Math.max(1, item.getMaxAmount());
        const whole = Math.max(1, item.getAmount());
        let remaining = whole;

        for (let slot = 0; slot < this.slots.length && remaining > 0; slot++) {
            const held = this.slots[slot] ?? null;
            if (held === null || !stacksWith(held, item)) continue;

            const room = max - held.getAmount();
            if (room <= 0) continue;

            const moved = Math.min(room, remaining);
            this.set(slot, held.withCount(held.getAmount() + moved));
            remaining -= moved;
        }

        for (let slot = 0; slot < this.slots.length && remaining > 0; slot++) {
            if (this.slots[slot] !== null) continue;

            const moved = Math.min(max, remaining);
            this.set(slot, moved === item.getAmount() ? item : item.withCount(moved));
            remaining -= moved;
        }

        return remaining;
    }

    /** Every slot in order, empty ones as null, so a slot's index is its position. A copy of the row. */
    public items(): readonly (Item | null)[] {
        return [...this.slots];
    }

    /** The stacks the container holds, in slot order, with the empty slots left out. */
    public stacks(): Item[] {
        return this.slots.filter((item) => item !== null);
    }

    /** Empties every slot that holds something. Each emptied slot is reported as a write. */
    public clear(): void {
        for (const [slot, item] of this.slots.entries()) if (item !== null) this.set(slot, null);
    }

    /**
     * Changes how many slots the container has, as a llama's capacity follows its strength.
     *
     * Shrinking empties the slots that go, reported as writes, before they are removed. Growing
     * adds empty slots, which reports nothing.
     * @param size - The new number of slots.
     * @returns The stacks that were in the slots that went, in slot order.
     */
    public resize(size: number): Item[] {
        const target = Math.max(0, size);
        const dropped: Item[] = [];

        for (let slot = target; slot < this.slots.length; slot++) {
            const item = this.slots[slot] ?? null;
            if (item === null) continue;
            dropped.push(item);
            this.set(slot, null);
        }

        while (this.slots.length > target) this.slots.pop();
        while (this.slots.length < target) this.slots.push(null);
        // A slot added here was never logged, and reads as empty through `?? null`.
        this.logged.length = Math.min(this.logged.length, target);
        return dropped;
    }

    /** Tells the observer, if there is one, what a slot holds now. */
    private written(slot: number): void {
        if (this.observer === null) return;
        const before = this.logged[slot] ?? null;
        const after = slotValueOf(this.slots[slot] ?? null);
        this.logged[slot] = after;
        this.observer(slot, before, after);
    }
}
