const Inventory = require('./inventory');
const Item = require('../item').default;


const PlayerInventorySlots = 36;
class PlayerInventory extends Inventory {
    /** @type {number} */
    #handSlot = 0

    constructor() {
        super(PlayerInventorySlots);
    }

    /**
     * Sets an item into the hand slot.
     * 
     * @param {Item} item 
     */
    setItemInHand(item) {
        this.setItem(this.#handSlot, item);
    }

    /**
     * Returns the item in the player hand.
     * 
     * @returns {Item}
     */
    getItemInHand() {
        return this.getItem(this.#handSlot);
    }

    /**
     * Returns the hand slot.
     * 
     * @returns {number}
     */
    getHandSlotIndex() {
        return this.#handSlot;
    }
}
module.exports = PlayerInventory;
