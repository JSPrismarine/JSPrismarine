import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class StoneShovel extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:stone_shovel',
                id: ItemIdsType.StoneShovel
            },
            ItemTieredToolType.Stone
        );
    }

    public getMaxDurability() {
        return 132;
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }
}
