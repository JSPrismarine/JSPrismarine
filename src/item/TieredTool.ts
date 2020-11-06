import { ItemProps } from './Item';
import { ItemTieredToolType } from './ItemTieredToolType';
import Tool from './Tool';

export default class TieredTool extends Tool {
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
