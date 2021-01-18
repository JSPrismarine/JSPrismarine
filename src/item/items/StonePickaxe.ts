import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class StonePickaxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:stone_pickaxe',
                id: ItemIdsType.StonePickaxe
            },
            ItemTieredToolType.Stone
        );
    }

    getMaxDurability() {
        return 132;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
}
