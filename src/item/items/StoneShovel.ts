import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class StoneShovel extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:stone_shovel',
                id: ItemIdsType.StoneShovel
            },
            ItemTieredToolType.Stone
        );
    }

    getMaxDurability() {
        return 132;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
