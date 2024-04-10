import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

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
