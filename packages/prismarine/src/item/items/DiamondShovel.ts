import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class DiamondShovel extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:diamond_shovel',
                id: ItemIdsType.DiamondShovel
            },
            ItemTieredToolType.Diamond
        );
    }

    public getMaxDurability() {
        return 1562;
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }
}
