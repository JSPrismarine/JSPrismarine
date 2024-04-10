import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import { TieredTool } from '../TieredTool';

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

    public getBurnTime() {
        return 200;
    }

    public getMaxDurability() {
        return 60;
    }

    public getToolType() {
        return BlockToolType.Axe;
    }
}
