import type { ItemProps } from './Item';
import { ItemTieredToolType } from './ItemTieredToolType';
import Tool from './Tool';

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
