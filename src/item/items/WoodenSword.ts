import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class WoodenSword extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:wooden_sword',
                id: ItemIdsType.WoodenSword
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
        return BlockToolType.Sword;
    }
}
