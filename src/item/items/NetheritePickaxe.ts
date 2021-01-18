import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class NetheritePickaxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:netherite_pickaxe',
                id: ItemIdsType.NetheritePickaxe
            },
            ItemTieredToolType.Netherite
        );
    }

    public getMaxDurability() {
        return 2032;
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }
}
