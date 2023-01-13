import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import type Item from '../../item/Item.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import type Server from '../../Server.js';
import Solid from '../Solid.js';

export default class LitFurnace extends Solid {
    public constructor() {
        super({
            name: 'minecraft:lit_furnace',
            id: BlockIdsType.LitFurnace,
            hardness: 3.5
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:furnace')];
    }
}
