import { BlockToolType } from '../../block/BlockToolType';
import { ItemIdsType } from '../ItemIdsType';
import { ItemTieredToolType } from '../ItemTieredToolType';
import TieredTool from '../TieredTool';

export default class NetheriteAxe extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:netherite_axe',
                id: ItemIdsType.NetheriteAxe
            },
            ItemTieredToolType.Netherite
        );
    }

    public getMaxDurability() {
        return 2032;
    }

    public getToolType() {
        return BlockToolType.Axe;
    }
}
