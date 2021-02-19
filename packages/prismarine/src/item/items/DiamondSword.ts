import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class DiamondSword extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:diamond_sword',
                id: ItemIdsType.DiamondSword
            },
            ItemTieredToolType.Diamond
        );
    }

    public getMaxDurability() {
        return 1562;
    }

    public getToolType() {
        return BlockToolType.Sword;
    }
}
