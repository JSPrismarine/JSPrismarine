import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class IronAxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:iron_axe',
                id: ItemIdsType.IronAxe
            },
            ItemTieredToolType.Iron
        );
    }

    getMaxDurability() {
        return 251;
    }

    getToolType() {
        return BlockToolType.Axe;
    }
}
