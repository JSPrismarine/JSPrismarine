import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class GoldenHoe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:golden_hoe',
                id: ItemIdsType.GoldenHoe
            },
            ItemTieredToolType.Gold
        );
    }

    public getMaxDurability() {
        return 32;
    }
}
