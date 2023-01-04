import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Item from '../../item/Item.js';
import Server from '../../Server.js';
import Solid from '../Solid.js';

export default class Sand extends Solid {
    public constructor(name = 'minecraft:gravel') {
        super({
            name,
            id: BlockIdsType.Gravel,
            hardness: 0.6
        });
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Shovel];
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        if (Math.floor(Math.random() * 10) === 1) {
            return [server.getItemManager().getItem('minecraft:flint')];
        }

        return [server.getBlockManager().getBlock('minecraft:gravel')];
    }
}
