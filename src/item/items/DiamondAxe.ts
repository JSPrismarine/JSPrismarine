import TieredTool from '../TieredTool';
import {BlockToolType} from '../../block/BlockToolType';
import {ItemIdsType} from '../ItemIdsType';
import {ItemTieredToolType} from '../ItemTieredToolType';

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
