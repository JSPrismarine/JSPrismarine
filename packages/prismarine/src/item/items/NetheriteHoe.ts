import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

export default class NetheriteHoe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:wooden_hoe',
                id: ItemIdsType.NetheriteHoe
            },
            ItemTieredToolType.Netherite
        );
    }

    public getMaxDurability() {
        return 2031;
    }
}
