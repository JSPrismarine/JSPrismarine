import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class NetheritePickaxe extends TieredTool {
    constructor() {
        super(
            {
                name: 'minecraft:netherite_pickaxe',
                id: ItemIdsType.NetheritePickaxe
            },
            ItemTieredToolType.Netherite
        );
    }

    getMaxDurability() {
        return 2032;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
}
