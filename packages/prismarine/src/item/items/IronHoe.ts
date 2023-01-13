import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class IronHoe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:iron_hoe',
                id: ItemIdsType.IronHoe
            },
            ItemTieredToolType.Iron
        );
    }

    public getMaxDurability() {
        return 250;
    }
}
