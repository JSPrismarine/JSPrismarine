const Item = require('../../item/Item').default;

class CreativeContentEntry {
    /** @type {number} */
    entryId;
    /** @type {Item} */
    item;

    constructor(entryId, item) {
        this.entryId = entryId;
        this.item = item;
    }
}

module.exports = CreativeContentEntry;
