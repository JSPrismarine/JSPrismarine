import Item, { ItemProps } from ".";
import { ItemTieredToolType } from "./ItemTieredToolType";

export default class TieredTool extends Item {
    private tier: ItemTieredToolType = ItemTieredToolType.None;

    constructor(args: ItemProps, tier: ItemTieredToolType) {
        super(args);
        this.tier = tier;
    }

    getTier() {
        return this.tier;
    }

    getToolHarvestLevel() {
        return this.getTier();
    }
}
