import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class IronShovel extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:iron_shovel',
                id: ItemIdsType.IronShovel
            },
            ItemTieredToolType.Iron
        );
    }

    public getMaxDurability() {
        return 251;
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }
}
