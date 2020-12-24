import Solid from '../Solid';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Item from '../../item/Item';
import Server from '../../Server';

export default class LapisBlock extends Solid {
    constructor() {
        super({
            name: 'minecraft:lapis_block',
            id: BlockIdsType.LapisBlock,
            hardness: 3
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Stone;
    }

    getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:lapis_block')];
    }
}
