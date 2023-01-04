import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Item from '../../item/Item.js';
import Server from '../../Server.js';
import Solid from '../Solid.js';

export default class Farmland extends Solid {
    public constructor() {
        super({
            name: 'minecraft:farmland',
            id: BlockIdsType.Farmland,
            hardness: 0.6
        });
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Shovel];
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:dirt')];
    }

    public isPartOfCreativeInventory() {
        return false;
    }
}
