import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class WoodenHoe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:wooden_hoe',
                id: ItemIdsType.WoodenHoe
            },
            ItemTieredToolType.Wood
        );
    }

    public getMaxDurability() {
        return 59;
    }
}
