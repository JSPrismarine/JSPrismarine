import Item from '../item/Item';
import Prismarine from '../Prismarine';
import {ItemTieredToolType} from '../item/ItemTieredToolType';
import {BlockToolType} from './BlockToolType';
import {ItemEnchantmentType} from '../item/ItemEnchantmentType';

export default class Block {
    id: number;
    runtimeId?: number;
    name: string;
    hardness: number;
    meta: number = 0;

    // TODO
    nbt = null;
    count = 1;

    constructor({
        id,
        name,
        hardness
    }: {
        id: number;
        name: string;
        hardness?: number;
    }) {
        this.id = id;
        this.name = name;
        this.hardness = hardness || 0;
    }

    /**
     * Get the Block's namespaced id
     */
    public getName() {
        return this.name;
    }

    /**
     * Get the Block's numeric id
     */
    public getId() {
        return this.id;
    }

    /**
     * Get the Block's runtime id
     */
    public getRuntimeId() {
        return this.id; // TODO: this.runtimeId
    }
    /**
     * Set the Block's runtime id
     *
     * WARNING: this should ONLY be used internally by the BlockManager class
     */
    public setRuntimeId(id: number) {
        this.runtimeId = id;
    }

    /**
     * Get the Block's hardness value
     */
    public getHardness() {
        return this.hardness;
    }

    /**
     * Get the Block's break time
     */
    public getBreakTime(item: Item | null, server: Prismarine) {
        return this.getHardness(); // TODO

        let base = this.getHardness();

        if (this.isCompatibleWithTool(item)) base *= 1.5;
        else base *= 5;

        const efficiency = 1; // item.getMiningEfficiency(this);

        return (base /= efficiency);
    }

    /**
     * Get the Block's blast resistance
     */
    getBlastResistance() {
        return this.getHardness() * 5;
    }

    /**
     * Get the Block's light level emission
     */
    getLightLevel() {
        return 0;
    }

    /**
     * Get the Block's flammability
     */
    getFlammability() {
        return 0;
    }

    /**
     * Get the Block's required tool type
     */
    getToolType(): BlockToolType {
        return BlockToolType.None;
    }

    /**
     * Get the Block's required item tool tier
     */
    getToolHarvestLevel(): ItemTieredToolType {
        return ItemTieredToolType.None;
    }

    /**
     * Get the Block's drop(s) if the tool is compatible
     */
    getDropsForCompatibleTool(
        item: Item,
        server: Prismarine
    ): Array<Block | Item | null> {
        return [this];
    }

    /**
     * Get the Block's drop(s) from the current item
     */
    getDrops(item: Item, server: Prismarine): Array<Block | Item | null> {
        if (this.isCompatibleWithTool(item)) {
            if (
                this.isAffectedBySilkTouch() &&
                item.hasEnchantment(ItemEnchantmentType.SilkTouch)
            )
                return this.getSilkTouchDrops(item, server);

            return this.getDropsForCompatibleTool(item, server);
        }

        return [];
    }

    /**
     * Get the Block's drop(s) if silk touch is used
     */
    getSilkTouchDrops(item: Item, server: Prismarine) {
        return [this];
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

    isCompatibleWithTool(item: Item | null) {
        if (!item) return false;

        if (this.getHardness() < 0) return false;

        const toolType = this.getToolType();
        const harvestLevel = this.getToolHarvestLevel();

        if (toolType === BlockToolType.None || harvestLevel === 0) return true;
        else if (
            toolType & item.getToolType() &&
            item.getToolHarvestLevel() >= harvestLevel
        )
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
