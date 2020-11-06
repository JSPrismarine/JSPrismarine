import TieredTool from '../TieredTool';
import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';

export default class GoldenShovel extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:golden_shovel',
                id: ItemIdsType.GoldenShovel
            },
            ItemTieredToolType.Gold
        );
    }

    getMaxDurability() {
        return 33;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
