import ContainerEntry from './ContainerEntry.js';
import Inventory from './Inventory.js';
import Item from '../item/Item.js';

export default class HumanInventory extends Inventory {
    private get handSlot() {
        return 0;
    }

    public constructor() {
        super(36);
    }

    /**
     * Sets an item into the hand slot.
     */
    public setItemInHand(item: ContainerEntry) {
        this.setItem(this.handSlot, item);
    }

    /**
     * Returns the item in the player hand.
     */
    public getItemInHand(): Item {
        return this.getItem(this.handSlot);
    }

    /**
     * Returns the hand slot.
     */
    public getHandSlotIndex(): number {
        return this.handSlot;
    }
}
