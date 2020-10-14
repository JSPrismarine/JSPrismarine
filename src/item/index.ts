import { BlockToolType } from "../block/BlockToolType"
import { ItemEnchantmentType } from "./ItemEnchantmentType"
import { ItemTieredToolType } from "./ItemTieredToolType"

export interface ItemProps {
    id: number,
    name: string,
    meta?: number,
    nbt?: any,
    count?: number
};

export default class Item {
    id: number
    name: string

    meta?: number
    nbt?: any
    count?: number

    constructor({ id, name, meta, count, nbt }: ItemProps) {
        this.id = id;
        this.meta = meta;
        this.count = count;
        this.nbt = nbt || null;
        this.name = name;
    }

    getToolType() {
        return BlockToolType.None;
    }

    getToolHarvestLevel() {
        return 0;
    }

    hasEnchantment(enchantment: ItemEnchantmentType) {
        return false;
    }
}
