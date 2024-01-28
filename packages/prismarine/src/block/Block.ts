import { item_id_map as BlockIdMap } from '@jsprismarine/bedrock-data';
import { BlockToolType } from './BlockToolType.js';
import Item from '../item/Item.js';
import { ItemEnchantmentType } from '../item/ItemEnchantmentType.js';
import { ItemTieredToolType } from '../item/ItemTieredToolType.js';
import Server from '../Server.js';

export default class Block {
    /**
     * The block's numeric block ID.
     */
    public id: number;

    /**
     * The block's namespaced block ID.
     */
    public name: string;

    /**
     * The block's java-edition namespaced block ID.
     */
    public javaName: string;
    public hardness: number;
    public meta = 0;
    private networkId: number;

    // TODO
    public nbt = null;
    public count = 1;

    public constructor({
        id,
        name,
        javaName,
        parentName,
        hardness
    }: {
        id: number;
        name: string;
        javaName?: string;
        parentName?: string;
        hardness?: number;
    }) {
        this.id = id;
        this.name = name;
        this.hardness = hardness ?? 0;
        this.name = name;
        this.javaName = javaName ?? name;

        this.networkId = BlockIdMap[parentName ?? name] as number;
        // if (!this.networkId) console.log(name, id, this.networkId);
    }

    /**
     * Get the Block's namespaced id.
     */
    public getName() {
        return this.name;
    }

    /**
     * Get the Block's meta value.
     */
    public getMeta() {
        return this.meta;
    }

    /**
     * Get the Block's numeric id.
     *
     * @returns The block's numeric ID.
     */
    public getId() {
        return this.id;
    }

    /**
     * Get the Block's network numeric id.
     */
    public getNetworkId() {
        return this.networkId ?? this.getId();
    }

    /**
     * Get the Block's hardness value.
     */
    public getHardness(): number {
        return this.hardness;
    }

    /**
     * Get the Block's break time.
     */
    public getBreakTime(_item: Item | null, _server: Server) {
        return this.getHardness(); // TODO: Fix break time calculations

        /* let base = this.getHardness();
        base *= this.isCompatibleWithTool(item) ? 1.5 : 5;
        const efficiency = 1; // Item.getMiningEfficiency(this);
        return (base /= efficiency); */
    }

    /**
     * Get the Block's blast resistance.
     */
    public getBlastResistance() {
        return this.getHardness() * 5;
    }

    /**
     * Get the Block's light level emission.
     */
    public getLightLevel() {
        return 0;
    }

    /**
     * Get the Block's flammability.
     */
    public getFlammability() {
        return 0;
    }

    /**
     * Get the Block's required tool type.
     */
    public getToolType(): BlockToolType[] {
        return [BlockToolType.None];
    }

    /**
     * Get the Block's required item tool tier.
     */
    public getToolHarvestLevel(): ItemTieredToolType {
        return ItemTieredToolType.None;
    }

    /**
     * Get the Block's drop(s) if the tool is compatible.
     */
    public getDropsForCompatibleTool(_item: Item | null, _server: Server): Array<Block | Item | null> {
        return [this];
    }

    /**
     * Get the Block's drop(s) from the current item.
     */
    public getDrops(item: Item | null, server: Server): Array<Block | Item | null> {
        if (this.isCompatibleWithTool(item)) {
            if (this.isAffectedBySilkTouch() && item?.hasEnchantment(ItemEnchantmentType.SilkTouch))
                return this.getSilkTouchDrops(item, server);

            return this.getDropsForCompatibleTool(item, server);
        }

        return [];
    }

    /**
     * Get the Block's drop(s) if silk touch is used.
     */
    public getSilkTouchDrops(_item: Item, _server: Server) {
        return [this];
    }

    public getLightFilter() {
        return 15;
    }

    public canPassThrough() {
        return false;
    }

    /**
     * Sets if the block can be replaced when place action occurs on it.
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

    /**
     * Check if the block is breakable.
     *
     * @returns `true` if the block is breakable otherwise `false`.
     */
    public isBreakable(): boolean {
        return true;
    }

    /**
     * Check if the block is solid.
     *
     * @returns `true` if the block is solid otherwise `false`.
     */
    public isSolid() {
        return false;
    }

    public isCompatibleWithTool(item: Item | null) {
        const toolType = this.getToolType();
        const harvestLevel = this.getToolHarvestLevel();

        if (toolType.includes(BlockToolType.None) || harvestLevel <= 0) return true;
        if (!item) return false;
        if (toolType.includes(item.getToolType()) && item.getToolHarvestLevel() >= harvestLevel) return true;
        return false;
    }

    public isAffectedBySilkTouch() {
        return true;
    }

    public isPartOfCreativeInventory() {
        return true;
    }
}
