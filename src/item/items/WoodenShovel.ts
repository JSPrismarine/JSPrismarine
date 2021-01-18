import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class WoodenShovel extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:wooden_shovel',
                id: ItemIdsType.WoodenShovel
            },
            ItemTieredToolType.Wood
        );
    }

    getBurntime() {
        return 200;
    }

    getMaxDurability() {
        return 60;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
