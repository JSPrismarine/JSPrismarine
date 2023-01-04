import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class IronPickaxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:iron_pickaxe',
                id: ItemIdsType.IronPickaxe
            },
            ItemTieredToolType.Iron
        );
    }

    public getMaxDurability() {
        return 251;
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }
}
