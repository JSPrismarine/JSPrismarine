import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class StoneHoe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:stone_hoe',
                id: ItemIdsType.StoneHoe
            },
            ItemTieredToolType.Stone
        );
    }

    public getMaxDurability() {
        return 131;
    }
}
