import TieredTool from '../TieredTool';
import {BlockToolType} from '../../block/BlockToolType';
import {ItemIdsType} from '../ItemIdsType';
import {ItemTieredToolType} from '../ItemTieredToolType';

export default class GoldenPickaxe extends TieredTool {
    constructor() {
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
