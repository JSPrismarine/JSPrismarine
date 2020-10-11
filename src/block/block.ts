
export default class Block {
    /** @type {number} */
    id: number
    /** @type {string} */
    name: string

    // TODO
    nbt = null
    meta = 0
    count = 1

    constructor({ id, name }:{
        id: number,
        name: string
    }) {
        this.id = id;
        this.name = name;
    }
}
