import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

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
