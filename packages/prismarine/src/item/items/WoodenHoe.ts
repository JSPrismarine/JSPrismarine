import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

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
