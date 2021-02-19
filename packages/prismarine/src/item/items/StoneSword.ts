import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class StoneSword extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:stone_sword',
                id: ItemIdsType.StoneSword
            },
            ItemTieredToolType.Stone
        );
    }

    public getMaxDurability() {
        return 132;
    }

    public getToolType() {
        return BlockToolType.Sword;
    }
}
