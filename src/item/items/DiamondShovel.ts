import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

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
