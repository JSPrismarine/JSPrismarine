import { BlockToolType } from '../../block/BlockToolType.js';
import { ItemIdsType } from '../ItemIdsType.js';
import { ItemTieredToolType } from '../ItemTieredToolType.js';
import TieredTool from '../TieredTool.js';

export default class NetheriteShovel extends TieredTool {
    public constructor() {
        super(
            {
                name: 'minecraft:netherite_shovel',
                id: ItemIdsType.NetheriteShovel
            },
            ItemTieredToolType.Netherite
        );
    }

    public getMaxDurability() {
        return 2032;
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }
}
