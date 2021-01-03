import Solid from '../Solid';
import Item from '../../item/Item';
import Server from '../../Server';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class Farmland extends Solid {
    constructor() {
        super({
            name: 'minecraft:farmland',
            id: BlockIdsType.Farmland,
            hardness: 0.6
        });
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:dirt')];
    }

    public isPartOfCreativeInventory() {
        return false;
    }
}
