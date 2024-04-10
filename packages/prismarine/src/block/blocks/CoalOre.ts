import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import type { Item } from '../../item/Item';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import type Server from '../../Server';
import { Solid } from '../Solid';

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
