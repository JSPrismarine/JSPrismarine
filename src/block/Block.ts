import { BlockToolType } from './BlockToolType';
import Item from '../item/Item';
import { ItemEnchantmentType } from '../item/ItemEnchantmentType';
import { ItemTieredToolType } from '../item/ItemTieredToolType';
import Server from '../Server';

export default class Block {
    id: number;
    name: string;
    hardness: number;
    meta = 0;

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
        this.hardness = hardness ?? 0;
    }

    /**
     * Get the Block's namespaced id
     */
    public getName() {
        return this.name;
    }

    /**
     * Get the Block's meta value
     */
    public getMeta() {
        return this.meta;
    }

    /**
     * Get the Block's numeric id
     */
    public getId() {
        return this.id;
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
    public getBreakTime(item: Item | null, server: Server) {
        return this.getHardness(); // TODO: Fix break time calculations

        /* let base = this.getHardness();
        base *= this.isCompatibleWithTool(item) ? 1.5 : 5;
        const efficiency = 1; // Item.getMiningEfficiency(this);
        return (base /= efficiency); */
    }

    /**
     * Get the Block's blast resistance
     */
    public getBlastResistance() {
        return this.getHardness() * 5;
    }

    /**
     * Get the Block's light level emission
     */
    public getLightLevel() {
        return 0;
    }

    /**
     * Get the Block's flammability
     */
    public getFlammability() {
        return 0;
    }

    /**
     * Get the Block's required tool type
     */
    public getToolType(): BlockToolType {
        return BlockToolType.None;
    }

    /**
     * Get the Block's required item tool tier
     */
    public getToolHarvestLevel(): ItemTieredToolType {
        return ItemTieredToolType.None;
    }

    /**
     * Get the Block's drop(s) if the tool is compatible
     */
    public getDropsForCompatibleTool(
        item: Item,
        server: Server
    ): Array<Block | Item | null> {
        return [this];
    }

    /**
     * Get the Block's drop(s) from the current item
     */
    public getDrops(item: Item, server: Server): Array<Block | Item | null> {
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
    public getSilkTouchDrops(item: Item, server: Server) {
        return [this];
    }

    public getLightFilter() {
        return 15;
    }

    public canPassThrough() {
        return false;
    }

    /**
     * Sets if the block can be replaced when place action occurs on it
     */
    public canBeReplaced() {
        return false;
    }

    public canBePlaced() {
        return true;
    }

    public canBeFlowedInto() {
        return false;
    }

    public isTransparent() {
        return false;
    }

    public isBreakable() {
        return true;
    }

    public isSolid() {
        return false;
    }

    public isCompatibleWithTool(item: Item | null) {
        if (!item) return false;

        if (this.getHardness() < 0) return false;

        const toolType = this.getToolType();
        const harvestLevel = this.getToolHarvestLevel();

        if (toolType === BlockToolType.None || harvestLevel === 0) return true;
        if (
            toolType & item.getToolType() &&
            item.getToolHarvestLevel() >= harvestLevel
        )
            return true;

        return false;
    }

    public isAffectedBySilkTouch() {
        return true;
    }

    public isPartOfCreativeInventory() {
        return true;
    }
}
