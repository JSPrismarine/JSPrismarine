import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class GoldenSword extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:golden_sword',
                id: ItemIdsType.GoldenSword
            },
            ItemTieredToolType.Gold
        );
    }

    public getMaxDurability() {
        return 33;
    }

    public getToolType() {
        return BlockToolType.Sword;
    }
}
