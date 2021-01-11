import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class GoldenAxe extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:golden_axe',
                id: ItemIdsType.GoldenAxe
            },
            ItemTieredToolType.Gold
        );
    }

    getMaxDurability() {
        return 33;
    }

    getToolType() {
        return BlockToolType.Axe;
    }
}
