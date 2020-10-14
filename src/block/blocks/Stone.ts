import Solid from '../Solid';
import Item from '../../item';
import Prismarine from '../../prismarine';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class Stone extends Solid {
    constructor() {
        super({
            name: 'minecraft:stone',
            id: BlockIdsType.Stone,
            hardness: 1.5
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Wooden;
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
        return [
            server.getBlockManager().getBlock('minecraft:cobblestone')
        ];
    }
};
