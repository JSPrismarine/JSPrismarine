const ItemAir = require("../block/blocks/Air").default;
const Item = require("../item/Item").default;

// TODO: viewer logic
class Inventory {
    /** @type {number} */
    #slots;
    /**
     * (Slot number - Item in the slot)
     * @type {Map<Number, Item>}
     */
    #content = new Map();

    constructor(slots = 0, items = []) {
        this.#slots = slots;
        this.setItems(items);
    }

    /**
     * Adds an array of items into the inventory.
     *
     * @param {Item[]} items - An array containing items
     */
    setItems(items = []) {
        if (items.length > this.#slots) {
            // If the inventory slots are less
            // than items cut the items array
            items = items.slice(0, this.#slots);
        }

        for (let i = 0; i < this.getSlotCount(); i++) {
            this.setItem(i, items[i] || new ItemAir());
        }
    }

    /**
     * Returns all the items inside the inventory.
     *
     * @param {boolean} includeAir - includes air in the items
     * @returns {Array<Item>}
     */
    getItems(includeAir = false) {
        if (includeAir) {
            return Array.from(this.#content.values());
        }

        return Array.from(this.#content.values()).filter(
            (item) => !(item instanceof ItemAir)
        );
    }

    /**
     * Sets an item in the inventory content.
     *
     * @param {number} slot
     * @param {Item} item
     * @returns {boolean}
     */
    setItem(slot, item) {
        if (slot > this.#slots) {
            return false;
        }

        this.#content.set(slot, item);
        return true;
    }

    /**
     * Returns the item in the slot.
     *
     * @param {number} slot - slot index
     */
    getItem(slot) {
        if (this.#content.has(slot)) {
            return this.#content.get(slot);
        } else {
            return new ItemAir();
        }
    }

    /**
     * Removes an item from a slot and returns it.
     *
     * @param {number} slot - slot index
     */
    removeItem(slot) {
        if (!this.#content.has(slot)) {
            return new ItemAir();
        }

        let item = this.#content.get(slot);
        this.#content.delete(slot);
        return item;
    }

    /**
     * Returns the slot count of the inventory.
     *
     * @returns {number}
     */
    getSlotCount() {
        return this.#slots;
    }
}
module.exports = Inventory;
