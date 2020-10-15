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
    id: number;
    runtimeId: number;
    name: string;
    meta: number = 0;

    // TODO
    nbt = null;
    count = 1;

    constructor({ id, name }: ItemProps) {
        this.id = id;
        this.runtimeId = id;
        this.name = name;
    }

    getRuntimeId() {
        // TODO: runtimeId
        return this.id;
    }
    setRuntimeId(id: number) {
        this.runtimeId = id;
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

    isPartOfCreativeInventory() {
        return true;
    }
}
