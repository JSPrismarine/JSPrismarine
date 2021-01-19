import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Item from '../../item/Item';
import Server from '../../Server';
import Solid from '../Solid';

export default class Farmland extends Solid {
    public constructor() {
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
