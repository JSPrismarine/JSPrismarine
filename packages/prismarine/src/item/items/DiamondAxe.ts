import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

export default class DiamondAxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:diamond_axe',
                id: ItemIdsType.DiamondAxe
            },
            ItemTieredToolType.Diamond
        );
    }

    public getMaxDurability() {
        return 1562;
    }

    public getToolType() {
        return BlockToolType.Axe;
    }
}
