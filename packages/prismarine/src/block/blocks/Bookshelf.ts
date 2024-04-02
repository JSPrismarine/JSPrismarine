import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import type Item from '../../item/Item';
import type Server from '../../Server';
import { Solid } from '../Solid';

export default class Bookshelf extends Solid {
    public constructor() {
        super({
            name: 'minecraft:bookshelf',
            id: BlockIdsType.Bookshelf,
            hardness: 1.5
        });
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getItemManager().getItem('minecraft:book')];
    }

    public getToolType() {
        return [BlockToolType.Axe];
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }
}
