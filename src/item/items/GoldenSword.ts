import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class GoldenSword extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:golden_sword',
                id: ItemIdsType.GoldenSword
            },
            ItemTieredToolType.Gold
        );
    }

    getMaxDurability() {
        return 33;
    }

    getToolType() {
        return BlockToolType.Sword;
    }
}
