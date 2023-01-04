import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

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
