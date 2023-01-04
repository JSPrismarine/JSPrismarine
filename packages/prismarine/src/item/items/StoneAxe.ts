import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class StoneAxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:stone_axe',
                id: ItemIdsType.StoneAxe
            },
            ItemTieredToolType.Stone
        );
    }

    public getMaxDurability() {
        return 132;
    }

    public getToolType() {
        return BlockToolType.Axe;
    }
}
