import TieredTool from '../TieredTool';
import {BlockToolType} from '../../block/BlockToolType';
import {ItemIdsType} from '../ItemIdsType';
import {ItemTieredToolType} from '../ItemTieredToolType';

export default class StonePickaxe extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:stone_pickaxe',
                id: ItemIdsType.StonePickaxe
            },
            ItemTieredToolType.Stone
        );
    }

    getMaxDurability() {
        return 132;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
}
