import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class GoldenPickaxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:golden_pickaxe',
                id: ItemIdsType.GoldenPickaxe
            },
            ItemTieredToolType.Gold
        );
    }

    public getMaxDurability() {
        return 33;
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }
}
