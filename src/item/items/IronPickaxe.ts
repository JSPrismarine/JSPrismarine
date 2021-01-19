import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

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
