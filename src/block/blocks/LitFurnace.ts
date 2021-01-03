import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import type Server from '../../Server';
import type Item from '../../item/Item';

export default class LitFurnace extends Solid {
    constructor() {
        super({
            name: 'minecraft:lit_furnace',
            id: BlockIdsType.LitFurnace,
            hardness: 3.5
        });
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:furnace')];
    }
}
