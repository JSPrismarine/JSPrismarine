import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

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
