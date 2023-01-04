import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import type Item from '../../item/Item.js';
import type Server from '../../Server.js';
import Solid from '../Solid.js';

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
