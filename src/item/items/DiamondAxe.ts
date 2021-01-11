import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class DiamondAxe extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:diamond_axe',
                id: ItemIdsType.DiamondAxe
            },
            ItemTieredToolType.Diamond
        );
    }

    getMaxDurability() {
        return 1562;
    }

    getToolType() {
        return BlockToolType.Axe;
    }
}
