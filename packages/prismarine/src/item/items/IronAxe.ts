import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class IronAxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:iron_axe',
                id: ItemIdsType.IronAxe
            },
            ItemTieredToolType.Iron
        );
    }

    public getMaxDurability() {
        return 251;
    }

    public getToolType() {
        return BlockToolType.Axe;
    }
}
