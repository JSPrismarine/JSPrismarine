import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

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
