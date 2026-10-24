import { item_id_map as BlockIdMap } from '@jsprismarine/bedrock-data';
import type Server from '../Server';
import type { Item } from '../item/Item';
import { ItemEnchantmentType } from '../item/ItemEnchantmentType';
import { ItemTieredToolType } from '../item/ItemTieredToolType';
import { BlockToolType } from './BlockToolType';
import type { DropTable } from './DropTable';
import { randomOf } from './DropTable';

export class Block {
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

    /**
     * The vanilla block state this block is placed as, when that differs from {@link name}.
     *
     * Bedrock does not always have one block per thing JSPrismarine models: all sixteen
     * coloured beds are `minecraft:bed` on the wire, with the colour living in the block
     * entity. Keeping the two apart lets the server register sixteen distinct blocks while
     * still giving them a runtime id the client can resolve.
     */
    public stateName?: string;
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
        stateName,
        hardness
    }: {
        id: number;
        name: string;
        javaName?: string;
        parentName?: string;
        stateName?: string;
        hardness?: number;
    }) {
        // There used to be an `Object.setPrototypeOf(this, Block.prototype)` here, and it
        // undid every subclass in the package. A subclass constructor calls `super` first, so
        // this ran on a half-built `Stone` and left it a plain `Block`: `new Stone()` was not
        // `instanceof Stone`, and every override went with it. Stone stopped dropping
        // cobblestone and dropped itself, no block was solid any more - so items fell through
        // the ground - and nothing needed the right tool, because `getToolType` was the base
        // one too. Three separate symptoms, one line.
        this.id = id;
        this.name = name;
        this.javaName = javaName ?? name;
        this.stateName = stateName;
        this.hardness = hardness ?? 0;

        this.networkId = (BlockIdMap as any)[parentName ?? name] as number;
    }

    public get [Symbol.toStringTag]() {
        return `Block(${this.toString()})`;
    }
    public toString() {
        return this.name;
    }

    /**
     * Get the Block's namespaced id.
     */
    public getName() {
        return this.name;
    }

    /** The vanilla block state to place, which is {@link name} unless overridden. */
    public getStateName(): string {
        return this.stateName ?? this.name;
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
        return this.networkId || this.getId();
    }

    /**
     * Get the Block's hardness value.
     */
    public getHardness(): number {
        return this.hardness;
    }

    /**
     * How long, in seconds, the block takes to break.
     *
     * Hardness on its own is not that time. Vanilla scales it by whether the tool in hand
     * can actually harvest the block: 1.5x when it can, 5x when it cannot - which is why
     * dirt takes 0.75s by hand and stone 7.5s, rather than the 0.5s and 1.5s their hardness
     * alone would suggest. Returning the hardness unscaled is what made the cracking
     * animation, whose speed the server derives from this, run out well before the block
     * gave way.
     */
    public getBreakTime(item: Item | null, _server: Server): number {
        // TODO: divide by the tool's mining efficiency, so that a diamond pickaxe is
        // quicker than a wooden one. Items do not carry one yet.
        return this.getHardness() * (this.isCompatibleWithTool(item) ? 1.5 : 5);
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
     * What this block yields, as chances rather than as code.
     *
     * The hook a block overrides when what it drops is not simply itself and not certain -
     * seeds from grass, flint from gravel, a sapling from leaves. A table can be read against
     * the game and rolled with a chance source of the caller's choosing; a `Math.random()` in
     * the block, which is how gravel's flint was written, can be neither.
     * @param {Item | null} _item - what it was broken with, for a table that depends on it.
     * @returns {DropTable | null} `null` for a block that yields itself, which is most of them.
     */
    public getDropTable(_item: Item | null): DropTable | null {
        return null;
    }

    /**
     * Get the Block's drop(s) if the tool is compatible.
     */
    public getDropsForCompatibleTool(item: Item | null, server: Server): Array<Block | Item | null> {
        const table = this.getDropTable(item);

        return table ? table.roll(randomOf(server)) : [this];
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
