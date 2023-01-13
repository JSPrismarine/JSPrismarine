import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

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
