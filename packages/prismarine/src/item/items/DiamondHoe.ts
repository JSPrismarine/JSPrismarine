import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

export default class DiamondHoe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:diamond_hoe',
                id: ItemIdsType.DiamondHoe
            },
            ItemTieredToolType.Diamond
        );
    }

    public getMaxDurability() {
        return 1561;
    }
}
