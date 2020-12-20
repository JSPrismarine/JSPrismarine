import Block from '../block/Block';
import Inventory from './Inventory';
import Item from '../item/Item';

export default class PlayerInventory extends Inventory {
    private handSlot: number = 0;

    constructor() {
        super(36);
    }

    /**
     * Sets an item into the hand slot.
     */
    setItemInHand(item: Item | Block) {
        this.setItem(this.handSlot, item);
    }

    /**
     * Returns the item in the player hand.
     */
    getItemInHand(): Item | Block {
        return this.getItem(this.handSlot) as Item | Block;
    }

    /**
     * Returns the hand slot.
     */
    getHandSlotIndex(): number {
        return this.handSlot;
    }
}
