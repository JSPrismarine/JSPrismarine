import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

export default class GoldenShovel extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:golden_shovel',
                id: ItemIdsType.GoldenShovel
            },
            ItemTieredToolType.Gold
        );
    }

    public getMaxDurability() {
        return 33;
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }
}
