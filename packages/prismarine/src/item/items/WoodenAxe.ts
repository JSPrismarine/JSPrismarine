import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class WoodenAxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:wooden_axe',
                id: ItemIdsType.WoodenAxe
            },
            ItemTieredToolType.Wood
        );
    }

    public getBurntime() {
        return 200;
    }

    public getMaxDurability() {
        return 60;
    }

    public getToolType() {
        return BlockToolType.Axe;
    }
}
