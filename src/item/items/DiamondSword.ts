import TieredTool from '../TieredTool';
import {BlockToolType} from '../../block/BlockToolType';
import {ItemIdsType} from '../ItemIdsType';
import {ItemTieredToolType} from '../ItemTieredToolType';

export default class DiamondSword extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:diamond_sword',
                id: ItemIdsType.DiamondSword
            },
            ItemTieredToolType.Diamond
        );
    }

    getMaxDurability() {
        return 1562;
    }

    getToolType() {
        return BlockToolType.Sword;
    }
}
