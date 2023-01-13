import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Item from '../../item/Item.js';
import Server from '../../Server.js';
import Solid from '../Solid.js';

export default class Grass extends Solid {
    public constructor() {
        super({
            name: 'minecraft:grass',
            javaName: 'minecraft:grass_block',
            id: BlockIdsType.Grass,
            hardness: 0.6
        });
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Shovel];
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:dirt')];
    }
}
