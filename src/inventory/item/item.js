
class Item {
    /** @type {number} */
    id
    /** @type {number} */
    meta
    /** @type {any} */
    nbt
    /** @type {number} */
    count
    /** @type {string} */
    name

    constructor({ id, name, meta, count, nbt }) {
        this.id = id;
        this.meta = meta;
        this.count = count;
        this.nbt = nbt;
        this.name = name;
    }
}
module.exports = Item;
