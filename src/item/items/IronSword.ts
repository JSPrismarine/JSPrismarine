import TieredTool from '../TieredTool';
import {BlockToolType} from '../../block/BlockToolType';
import {ItemIdsType} from '../ItemIdsType';
import {ItemTieredToolType} from '../ItemTieredToolType';

export default class IronSword extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:iron_sword',
                id: ItemIdsType.IronSword
            },
            ItemTieredToolType.Iron
        );
    }

    getMaxDurability() {
        return 251;
    }

    getToolType() {
        return BlockToolType.Sword;
    }
}
