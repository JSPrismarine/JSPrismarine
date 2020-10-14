import { ItemTieredTool } from "../item/ItemTieredTool"
import { BlockToolType } from "./BlockToolType"

export default class Block {
    /** @type {number} */
    id: number
    /** @type {string} */
    name: string
    /** @type {number} */
    hardness: number

    // TODO
    nbt = null
    meta = 0
    count = 1

    constructor({ id, name, hardness }: {
        id: number,
        name: string,
        hardness?: number
    }) {
        this.id = id;
        this.name = name;
        this.hardness = hardness || 0;
    }

    getName() {
        return this.name;
    }

    getHardness() {
        return this.hardness;
    }

    getBlastResistance() {
        return this.getHardness() * 5;
    }

    getLightLevel() {
        return 0;
    }

    getToolType() {
        return BlockToolType.None;
    }

    getToolHarvestLevel() {
        return ItemTieredTool.None;
    }

    getDropsForCompatibleTool() {
        return this;
    }

    canPassThrough() {
        return false;
    }

    canBePlaced() {
        return true;
    }

    isBreakable() {
        return true;
    }

    isSolid() {
        return true;
    }
}
