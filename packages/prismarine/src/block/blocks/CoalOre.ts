import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Item from '../../item/Item.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Server from '../../Server.js';
import Solid from '../Solid.js';

export default class CoalOre extends Solid {
    public constructor() {
        super({
            name: 'minecraft:coal_ore',
            id: BlockIdsType.CoalOre,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getItemManager().getItem('minecraft:coal')];
    }
}
