import { BlockToolType } from '../block/BlockToolType';
import { ItemEnchantmentType } from './ItemEnchantmentType';
import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';

export interface ItemProps {
    id: number;
    name: string;
    meta?: number;
    nbt?: any;
    count?: number;
    durability?: number;
}

export default class Item {
    private id: number;
    private networkId: number;
    private name: string;
    public meta = 0;
    public durability: number = this.getMaxDurability();

    // TODO
    public nbt = null;
    public count = 1;

    public constructor({ id, name }: ItemProps) {
        this.id = id;
        this.name = name;

        this.networkId = ItemIdMap[name];
        // if (!this.networkId) console.log(name, id, this.networkId);
    }

    public getName(): string {
        return this.name;
    }

    public getId() {
        return this.id;
    }

    /**
     * Get the Block's network numeric id
     */
    public getNetworkId() {
        return this.networkId ?? this.getId();
    }

    public isTool() {
        return false;
    }

    public isArmorPiece() {
        return false;
    }

    public getBurntime() {
        return 0;
    }

    public getToolType() {
        return BlockToolType.None;
    }

    public getToolHarvestLevel() {
        return 0;
    }

    public getArmorDefensePoints() {
        return 0;
    }

    public getArmorToughness() {
        return 0;
    }

    public hasEnchantment(enchantment: ItemEnchantmentType) {
        return false;
    }

    public getEnchantability() {
        return 0;
    }

    public getMaxDurability() {
        return 0;
    }

    public getDurability() {
        return this.durability;
    }

    public getMaxAmount() {
        return 64;
    }

    public getAmount() {
        return this.count;
    }

    public isPartOfCreativeInventory() {
        return true;
    }
}
