import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class IronSword extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:iron_sword',
                id: ItemIdsType.IronSword
            },
            ItemTieredToolType.Iron
        );
    }

    public getMaxDurability() {
        return 251;
    }

    public getToolType() {
        return BlockToolType.Sword;
    }
}
