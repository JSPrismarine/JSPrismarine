import type ContainerEntry from './ContainerEntry';
import Inventory from './Inventory';
import type { Item } from '../item/Item';

/** Slots the hotbar reaches, and so the range a hand slot may name. */
const HOTBAR_SIZE = 9;

/** Helmet, chestplate, leggings, boots - the order the client numbers them in. */
const ARMOR_SLOTS = 4;

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
     * The stack held by the pointer, between picking it up and putting it down.
     *
     * A container of its own on the wire, and it has to be kept because a drag is two
     * requests: one that moves a stack out of a slot and onto the pointer, and a later one
     * that moves it off again. With nowhere to put it in between, the first request named a
     * container this server did not keep and was refused - which is why an item could be seen
     * in the creative menu and not dragged anywhere.
     */
    private cursor: Item | null = null;

    /**
     * What is being worn: helmet, chestplate, leggings, boots, in that order.
     *
     * A container of its own rather than four more slots on the end of the main one, because the
     * client addresses it as one - `ContainerUiId.ARMOR_CONTAINER` - and because everything that
     * walks the inventory looking for space would otherwise offer to put a pickaxe on your head.
     *
     * Until this existed `getArmorDefensePoints` had nowhere to read from, so the twenty-four
     * armour items that already declared their protection were declaring it to nobody and every
     * blow landed as though the player were naked.
     */
    private readonly armor = new Inventory(ARMOR_SLOTS);

    /** The off hand: one slot, for a shield or a torch. */
    private readonly offhand = new Inventory(1);

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

    /**
     * Armour points worn, summed across the four pieces.
     *
     * The per-piece figures already live on the item classes - an iron chestplate has said it is
     * worth six since long before anything asked.
     * @returns {number} Points, out of twenty for a full diamond set.
     */
    public getArmorDefensePoints(): number {
        return this.sumArmor((item) => item.getArmorDefensePoints());
    }

    /** Armour toughness worn, which only diamond and netherite have any of. */
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

    /** What the pointer is holding, or `null`. */
    public getCursor(): Item | null {
        return this.cursor;
    }

    public setCursor(item: Item | null): void {
        this.cursor = item;
    }

    /**
     * Points the hand at a hotbar slot, as the client reports it.
     * @param {number} slot - the hotbar slot; anything outside the hotbar is ignored.
     */
    public setHandSlot(slot: number): void {
        if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SIZE) return;

        this.handSlot = slot;
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
