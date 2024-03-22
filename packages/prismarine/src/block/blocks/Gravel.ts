import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Item from '../../item/Item';
import Server from '../../Server';
import Solid from '../Solid';

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
