import Item from "../item"
import Prismarine from "../prismarine"
import { ItemTieredToolType } from "../item/ItemTieredToolType"
import { BlockToolType } from "./BlockToolType"
import { ItemEnchantmentType } from "../item/ItemEnchantmentType"

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

    getToolType(): BlockToolType {
        return BlockToolType.None;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.None;
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine): Array<Block> {
        return [
            this
        ];
    }

    getDrops(item: Item, server: Prismarine): Array<Block> {
        if (this.isCompatibleWithTool(item)) {
            if (this.isAffectedBySilkTouch() && item.hasEnchantment(ItemEnchantmentType.SilkTouch))
                return this.getSilkTouchDrops(item, server);

            return this.getDropsForCompatibleTool(item, server)
        }

        return [];
    }

    getSilkTouchDrops(item: Item, server: Prismarine) {
        return [
            this
        ];
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

    isCompatibleWithTool(item: Item) {
        if (this.getHardness() < 0)
            return false;

        const toolType = item.getToolType();
        const harvestLevel = item.getToolHarvestLevel();

        if (toolType === this.getToolType())
            return true;
        else if (harvestLevel === 0)
            return true;
            
        return false;
    }

    isAffectedBySilkTouch() {
        return true;
    }
}
