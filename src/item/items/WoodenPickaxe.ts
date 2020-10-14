import TieredTool from '../TieredTool';
import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';

export default class Pickaxe extends TieredTool {
    constructor() {
        super({
            name: 'minecraft:wooden_pickaxe',
            id: ItemIdsType.WoodenPickaxe,
        }, ItemTieredToolType.Wooden);
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
};
