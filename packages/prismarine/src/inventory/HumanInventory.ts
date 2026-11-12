import ContainerEntry from './ContainerEntry';
import Inventory from './Inventory';
import type { PlayerContainer, SlotValue } from './slotLog';
import { itemOfSlotValue, slotValueOf, slotValueOfItem } from './slotLog';
import type { Item } from '../item/Item';
import type { ServerContent } from '../content/ServerContent';
import type { PlainData } from '../world/changelog/PlainData';
import type { ViewableEquipment } from '../entity/predicateView';

/** Slots the hotbar reaches, and so the range a hand slot may name. */
export const HOTBAR_SIZE = 9;

/** Helmet, chestplate, leggings, boots - the order the client numbers them in. */
export const ARMOR_SLOTS = 4;

/** Three rows of nine, the same as a single chest. */
const ENDER_CHEST_SLOTS = 27;

/** Hears every write to what a player carries, which is how it reaches the change log. */
export interface HumanInventoryObserver {
    /** One slot of one container changed, from `before` to `after`. */
    slot(container: PlayerContainer, slot: number, before: SlotValue, after: SlotValue): void;
    /** The hand moved from one hotbar slot to another. */
    handSlot(before: number, after: number): void;
}

export default class HumanInventory extends Inventory {
    /**
     * Which slot the hand points at.
     *
     * This was a getter returning zero, so the server believed every player was holding
     * whatever sat in their first slot however the hotbar was actually set - and the item it
     * handed to a block's drop calculation was never the one being mined with.
     */
    private handSlot = 0;

    /**
     * The next stack network id this player's client will be given.
     *
     * One count per player, as a Bedrock Dedicated Server 1.26.52 keeps it: a fresh player's
     * first creative pick was stack 1 and the next 2. The ids only have to be positive and never
     * reused for this client, and counting per player keeps one player's ids out of another's.
     */
    private nextStackNetworkId = 1;

    /**
     * The stack held by the pointer, between picking it up and putting it down.
     *
     * A container of its own on the wire, and it has to be kept because a drag is two
     * requests: one that moves a stack out of a slot and onto the pointer, and a later one
     * that moves it off again. With nowhere to put it in between, the first request named a
     * container this server did not keep and was refused - which is why an item could be seen
     * in the creative menu and not dragged anywhere.
     */
    private cursor: Item | null = null;

    /** Hears every write once {@link HumanInventory.observeCarried} has been called. */
    private carriedObserver: HumanInventoryObserver | null = null;

    /** The cursor's value as the observer last heard it. */
    private loggedCursor: SlotValue = null;

    /**
     * What is being worn: helmet, chestplate, leggings, boots, in that order.
     *
     * A container of its own rather than four more slots on the end of the main one, because the
     * client addresses it as one - `ContainerUiId.ARMOR_CONTAINER` - and because everything that
     * walks the inventory looking for space would otherwise offer to put a pickaxe on your head.
     *
     * Until this existed `getArmorDefensePoints` had nowhere to read from, so the twenty-four
     * armor items that already declared their protection were declaring it to nobody and every
     * blow landed as though the player were naked.
     */
    private readonly armor = new Inventory(ARMOR_SLOTS);

    /** The off hand: one slot, for a shield or a torch. */
    private readonly offhand = new Inventory(1);

    /**
     * The ender chest, which belongs to the player rather than to any block.
     *
     * On the player and not on the block for the reason vanilla puts it there: every
     * `minecraft:ender_chest` in every dimension shows the same 27 slots to one player, so
     * there is nothing a chest at a position could hold.
     */
    private readonly enderChest = new Inventory(ENDER_CHEST_SLOTS);

    public constructor() {
        super(36);
    }

    /** What is being worn. */
    public getArmor(): Inventory {
        return this.armor;
    }

    /** What is in the off hand. */
    public getOffhand(): Inventory {
        return this.offhand;
    }

    /** The player's own ender chest contents. */
    public getEnderChest(): Inventory {
        return this.enderChest;
    }

    /**
     * What is worn and held, as the network layer and the enchantment effect components read
     * it. The armor container's four slots are helmet, chestplate, leggings and boots in the
     * order the client numbers them, so the mapping is positional rather than looked up.
     */
    public getEquipment(): ViewableEquipment {
        const armor = this.getArmor();
        return {
            mainhand: this.getItemInHand(),
            offhand: this.getOffhand().getEntry(0)?.toItemStack(),
            head: armor.getEntry(0)?.toItemStack(),
            chest: armor.getEntry(1)?.toItemStack(),
            legs: armor.getEntry(2)?.toItemStack(),
            feet: armor.getEntry(3)?.toItemStack()
        };
    }

    /**
     * Armor points worn, summed across the four pieces.
     *
     * Each piece reads its own figure off Java's `minecraft:attribute_modifiers`, so an iron
     * chestplate is worth six here because Java says six.
     * @returns {number} Points, out of twenty for a full diamond set.
     */
    public getArmorDefensePoints(): number {
        return this.sumArmor((item) => item.getArmorDefensePoints());
    }

    /** Armor toughness worn, which only diamond and netherite have any of. */
    public getArmorToughness(): number {
        return this.sumArmor((item) => item.getArmorToughness());
    }

    private sumArmor(of: (item: Item) => number): number {
        let total = 0;

        for (let slot = 0; slot < ARMOR_SLOTS; slot++) {
            const entry = this.armor.getEntry(slot);
            if (entry) total += of(entry.toItemStack());
        }

        return total;
    }

    /**
     * Gives a stack its stack network id, if it has none yet.
     *
     * @param item - A stack this player holds. Air is left without one.
     * @returns The stack's id, or 0 for air.
     */
    public assignStackNetworkId(item: Item): number {
        if (item.getName() === 'minecraft:air') return 0;
        if (item.stackNetworkId === 0) item.stackNetworkId = this.nextStackNetworkId++;
        return item.stackNetworkId;
    }

    /**
     * Gives every stack this player holds an id, before the client is told what they hold.
     *
     * The ender chest too: its slots are this player's own stacks, and opening one sends them.
     */
    public assignStackNetworkIds(): void {
        for (const container of [this, this.armor, this.offhand, this.enderChest]) {
            for (const entry of container.getItems()) this.assignStackNetworkId(entry.getItem());
        }
        if (this.cursor) this.assignStackNetworkId(this.cursor);
    }

    /** What the pointer is holding, or `null`. */
    public getCursor(): Item | null {
        return this.cursor;
    }

    public setCursor(item: Item | null): void {
        this.cursor = item;
        if (this.carriedObserver === null) return;
        const before = this.loggedCursor;
        this.loggedCursor = slotValueOfItem(item);
        this.carriedObserver.slot('cursor', 0, before, this.loggedCursor);
    }

    /**
     * Reports every later write to the main slots, the armor, the off hand, the ender chest, the
     * cursor and the hand slot. A stack changed in place is not a write; see {@link Inventory.observe}.
     * @param observer - Hears each write.
     */
    public observeCarried(observer: HumanInventoryObserver): void {
        this.carriedObserver = observer;
        this.loggedCursor = slotValueOfItem(this.cursor);
        this.observe((slot, before, after) => observer.slot('inventory', slot, before, after));
        this.armor.observe((slot, before, after) => observer.slot('armor', slot, before, after));
        this.offhand.observe((slot, before, after) => observer.slot('offhand', slot, before, after));
        this.enderChest.observe((slot, before, after) => observer.slot('ender_chest', slot, before, after));
    }

    /**
     * Writes a logged value back into a slot, which is how the change log undoes a write. The
     * write is reported like any other, and the store ignores it while it is undoing.
     * @param container - The container the entry names. The crafting grid is not this inventory's.
     * @param slot - The slot.
     * @param value - The logged value to write back.
     * @param content - The content build, which decides an item's maximum durability.
     * @returns Whether this inventory has that container and slot.
     */
    public restoreSlot(container: PlayerContainer, slot: number, value: PlainData, content?: ServerContent): boolean {
        const item = itemOfSlotValue(value, content);
        if (container === 'cursor') {
            if (slot !== 0) return false;
            this.setCursor(item);
            return true;
        }
        const target = this.containerNamed(container);
        if (target === undefined || !Number.isInteger(slot) || slot < 0 || slot >= target.getSlotCount()) return false;
        if (item === null) target.removeItem(slot);
        else target.setItem(slot, new ContainerEntry({ item, count: item.getAmount() }));
        return true;
    }

    /**
     * What a slot holds, as the client is sent it: the stack with its count, or null for an
     * empty slot.
     * @param container - The container an `inventory-slot` entry names. The crafting grid is not
     *   this inventory's.
     * @param slot - The slot.
     * @returns The stack, null for an empty slot, or undefined when this inventory has no such slot.
     */
    public slotItem(container: PlayerContainer, slot: number): Item | null | undefined {
        if (container === 'cursor') return slot === 0 ? this.cursor : undefined;
        const target = this.containerNamed(container);
        if (target === undefined || !Number.isInteger(slot) || slot < 0 || slot >= target.getSlotCount())
            return undefined;
        const entry = target.getEntry(slot);
        return entry === null ? null : entry.toItemStack().withCount(entry.getCount());
    }

    /**
     * What one slot holds, as its slot entries log it.
     * @returns The value, or null for an empty slot or one this inventory does not have.
     */
    public slotValue(container: PlayerContainer, slot: number): SlotValue {
        if (container === 'cursor') return slot === 0 ? slotValueOfItem(this.cursor) : null;
        return slotValueOf(this.containerNamed(container)?.getEntry(slot) ?? null);
    }

    private containerNamed(container: PlayerContainer): Inventory | undefined {
        switch (container) {
            case 'inventory':
                return this;
            case 'armor':
                return this.armor;
            case 'offhand':
                return this.offhand;
            case 'ender_chest':
                return this.enderChest;
            default:
                return undefined;
        }
    }

    /**
     * Whether a slot number names one of the nine hotbar slots, and so may be the hand slot.
     * @param {number} slot - the slot, as a client reported it.
     */
    public static isHotbarSlot(slot: number): boolean {
        return Number.isInteger(slot) && slot >= 0 && slot < HOTBAR_SIZE;
    }

    /**
     * Points the hand at a hotbar slot, as the client reports it.
     * @param {number} slot - the hotbar slot; anything outside the hotbar is ignored.
     */
    public setHandSlot(slot: number): void {
        if (!HumanInventory.isHotbarSlot(slot)) return;

        const before = this.handSlot;
        this.handSlot = slot;
        if (before !== slot) this.carriedObserver?.handSlot(before, slot);
    }

    /**
     * Sets an item into the hand slot.
     */
    public setItemInHand(item: ContainerEntry) {
        this.setItem(this.handSlot, item);
    }

    /**
     * Returns the item in the player hand.
     *
     * Through the entry, so what comes back is an item and not a `Block` cast to look like
     * one. An empty hand holds air, air is a block, and a block has none of the methods an
     * item has: asking an empty hand whether it is enchanted threw, and it was asked on every
     * break - so a block mined by hand vanished and left no drop, because the throw happened
     * after the block was cleared and before the drop was made.
     */
    public getItemInHand(): Item {
        return this.getEntry(this.handSlot)!.toItemStack();
    }

    /**
     * Returns the hand slot.
     */
    public getHandSlotIndex(): number {
        return this.handSlot;
    }
}
