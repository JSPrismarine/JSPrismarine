import Solid from '../Solid';
import Item from '../../item';
import Prismarine from '../../prismarine';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

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
        return ItemTieredToolType.Wooden;
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
        return [
            server.getItemManager().getItem('minecraft:coal')
        ];
    }
};
