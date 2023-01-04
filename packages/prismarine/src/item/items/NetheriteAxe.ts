import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

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
