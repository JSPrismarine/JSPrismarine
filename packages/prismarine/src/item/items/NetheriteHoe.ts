import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

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
