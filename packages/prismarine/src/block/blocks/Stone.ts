import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import type Item from '../../item/Item';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import type Server from '../../Server';
import { Solid } from '../Solid';

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
