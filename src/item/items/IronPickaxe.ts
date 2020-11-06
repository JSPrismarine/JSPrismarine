import TieredTool from '../TieredTool';
import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';

export default class IronPickaxe extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:iron_pickaxe',
                id: ItemIdsType.IronPickaxe
            },
            ItemTieredToolType.Iron
        );
    }

    getMaxDurability() {
        return 251;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
}
