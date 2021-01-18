import { BlockToolType } from '../block/BlockToolType';
import { ItemEnchantmentType } from './ItemEnchantmentType';

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
    public meta = 0;
    durability: number = this.getMaxDurability();

    // TODO
    nbt = null;
    count = 1;

    public constructor({ id, name }: ItemProps) {
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

    public getBurntime() {
        return 0;
    }

    public getToolType() {
        return BlockToolType.None;
    }

    getToolHarvestLevel() {
        return 0;
    }

    public getArmorDefensePoints() {
        return 0;
    }

    public getArmorToughness() {
        return 0;
    }

    hasEnchantment(enchantment: ItemEnchantmentType) {
        return false;
    }

    getEnchantability() {
        return 0;
    }

    public getMaxDurability() {
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
