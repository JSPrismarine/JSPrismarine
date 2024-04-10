import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

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

    public getBurnTime() {
        return 200;
    }

    public getMaxDurability() {
        return 60;
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }
}
