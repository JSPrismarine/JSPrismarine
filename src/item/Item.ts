import {BlockToolType} from '../block/BlockToolType';
import {ItemEnchantmentType} from './ItemEnchantmentType';

export interface ItemProps {
    id: number;
    name: string;
    meta?: number;
    nbt?: any;
    count?: number;
    durability?: number;
}

export default class Item {
    id: number;
    runtimeId: number;
    name: string;
    meta: number = 0;
    durability: number = this.getMaxDurability();

    // TODO
    nbt = null;
    count: number = 1;

    constructor({id, name}: ItemProps) {
        this.id = id;
        this.runtimeId = id;
        this.name = name;
    }

    public getId() {
        return this.id;
    }

    public getRuntimeId() {
        // TODO: runtimeId
        return this.id;
    }

    isTool() {
        return false;
    }

    isArmorPiece() {
        return false;
    }

    setRuntimeId(id: number) {
        this.runtimeId = id;
    }

    getBurntime() {
        return 0;
    }

    getToolType() {
        return BlockToolType.None;
    }

    getToolHarvestLevel() {
        return 0;
    }

    getArmorDefensePoints() {
        return 0;
    }

    getArmorToughness() {
        return 0;
    }

    hasEnchantment(enchantment: ItemEnchantmentType) {
        return false;
    }

    getEnchantability() {
        return 0;
    }

    getMaxDurability() {
        return 0;
    }

    getDurability() {
        return this.durability;
    }

    getMaxAmount() {
        return 64;
    }

    getAmount() {
        return this.count;
    }

    isPartOfCreativeInventory() {
        return true;
    }
}
