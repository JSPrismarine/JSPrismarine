import { ItemProps } from './Item.js';
import { ItemTieredToolType } from './ItemTieredToolType.js';
import Tool from './Tool.js';

export default class TieredTool extends Tool {
    private readonly tier: ItemTieredToolType = ItemTieredToolType.None;

    public constructor(args: ItemProps, tier: ItemTieredToolType) {
        super(args);
        this.tier = tier;
    }

    public getTier() {
        return this.tier;
    }

    public getToolHarvestLevel() {
        return this.getTier();
    }
}
