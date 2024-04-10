import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

export default class DiamondPickaxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:diamond_pickaxe',
                id: ItemIdsType.DiamondPickaxe
            },
            ItemTieredToolType.Diamond
        );
    }

    public getMaxDurability() {
        return 1562;
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }
}
