import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Item from '../../item/Item';
import Server from '../../Server';
import Solid from '../Solid';

export default class Grass extends Solid {
    public constructor() {
        super({
            name: 'minecraft:grass',
            id: BlockIdsType.Grass,
            hardness: 0.6
        });
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:dirt')];
    }
}
