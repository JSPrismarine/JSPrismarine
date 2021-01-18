import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class GoldenPickaxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:golden_pickaxe',
                id: ItemIdsType.GoldenPickaxe
            },
            ItemTieredToolType.Gold
        );
    }

    getMaxDurability() {
        return 33;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
}
