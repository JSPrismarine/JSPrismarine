import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Item from '../../item/Item.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Server from '../../Server.js';
import Solid from '../Solid.js';

export enum StoneType {
    Stone = 0,
    Granite = 1,
    PolishedGranite = 2,
    Diorite = 3,
    PolishedDiorite = 4,
    Andesite = 5,
    PolishedAndesite = 6
}

export default class Stone extends Solid {
    public constructor(name = 'minecraft:stone', type: StoneType = StoneType.Stone) {
        super({
            name,
            parentName: 'minecraft:stone',
            id: BlockIdsType.Stone,
            hardness: 1.5
        });
        this.meta = type;
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getBlockManager().getBlock('minecraft:cobblestone')];
    }
}
