import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Item from '../../item/Item';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Server from '../../Server';
import Solid from '../Solid';

export default class CoalOre extends Solid {
    constructor() {
        super({
            name: 'minecraft:coal_ore',
            id: BlockIdsType.CoalOre,
            hardness: 3
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }

    getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getItemManager().getItem('minecraft:coal')];
    }
}
