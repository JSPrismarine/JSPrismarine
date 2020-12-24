import Solid from '../Solid';
import Item from '../../item/Item';
import Server from '../../Server';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class Grass extends Solid {
    constructor() {
        super({
            name: 'minecraft:grass',
            id: BlockIdsType.Grass,
            hardness: 0.6
        });
    }

    getToolType() {
        return BlockToolType.Shovel;
    }

    getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:dirt')];
    }
}
