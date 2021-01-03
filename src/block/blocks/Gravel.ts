import Solid from '../Solid';
import Item from '../../item/Item';
import Server from '../../Server';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class Sand extends Solid {
    constructor(name = 'minecraft:gravel') {
        super({
            name,
            id: BlockIdsType.Gravel,
            hardness: 0.6
        });
    }

    getToolType() {
        return BlockToolType.Shovel;
    }

    getDropsForCompatibleTool(item: Item, server: Server) {
        if (Math.floor(Math.random() * 10) === 1) {
            return [server.getItemManager().getItem('minecraft:flint')];
        }

        return [server.getBlockManager().getBlock('minecraft:gravel')];
    }
}
