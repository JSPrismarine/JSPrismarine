'use strict'

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

    constructor(id = 0, meta = 0, count = 0, nbt = null, name = '') {
        this.id =  id
        this.meta = meta
        this.count = count
        this.nbt = null
        this.name = name
    }
}
