import Item from "../item"
import Prismarine from "../prismarine"
import { ItemTieredToolType } from "../item/ItemTieredToolType"
import { BlockToolType } from "./BlockToolType"
import { ItemEnchantmentType } from "../item/ItemEnchantmentType"

export default class Block {
    id: number;
    runtimeId?: number;
    name: string;
    hardness: number;
    meta: number = 0;

    // TODO
    nbt = null;
    count = 1;

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

    getId() {
        return this.id;
    }

    getRuntimeId() {
        return this.id;
    }
    setRuntimeId(id: number) {
        this.runtimeId = id;
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

    getFlammability() {
        return 0;
    }

    getToolType(): BlockToolType {
        return BlockToolType.None;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.None;
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine): Array<Block | Item | null> {
        return [
            this
        ];
    }

    getDrops(item: Item, server: Prismarine): Array<Block | Item | null> {
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

    getLightFilter() {
        return 15;
    }

    canPassThrough() {
        return false;
    }

    canBePlaced() {
        return true;
    }

    canBeFlowedInto() {
        return false;
    }

    isTransparent() {
        return false;
    }

    isBreakable() {
        return true;
    }

    isSolid() {
        return false;
    }

    isCompatibleWithTool(item: Item) {
        if (this.getHardness() < 0)
            return false;

        const toolType = this.getToolType();
        const harvestLevel = this.getToolHarvestLevel();

        if (toolType  === BlockToolType.None || harvestLevel === 0)
            return true;
        else if (toolType & item.getToolType() && (item.getToolHarvestLevel() >= harvestLevel))
            return true;

        return false;
    }

    isAffectedBySilkTouch() {
        return true;
    }

    isPartOfCreativeInventory() {
        return true;
    }
}
