import Solid from '../Solid';
import Item from '../../item';
import Prismarine from '../../prismarine';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export enum StoneType {
    Stone = 0,
    Granite = 1,
    PolishedGranite = 2,
    Diorite = 3,
    PolishedDiorite = 4,
    Andesite = 5,
    PolishedAndesite = 6
};

export default class Stone extends Solid {
    constructor(name: string = 'minecraft:stone', type: StoneType = StoneType.Stone) {
        super({
            name: name,
            id: BlockIdsType.Stone,
            hardness: 1.5,
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Wooden;
    }

    getDropsForCompatibleTool(item: Item, server: Prismarine) {
        return [
            server.getBlockManager().getBlock('minecraft:cobblestone')
        ];
    }
};
