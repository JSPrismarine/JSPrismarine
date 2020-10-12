export enum BlockToolType {
    None = 0,
    Sword = 1 << 0,
    Shovel = 1 << 1,
    Pickaxe = 1 << 2,
    Axe = 1 << 3,
    Shears = 1 << 4
};

export enum BlockToolHarvestLevel {
    None
};

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
