import Solid from '../Solid';
import Item from '../../item';
import Prismarine from '../../prismarine';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class IronOre extends Solid {
    constructor() {
        super({
            name: 'minecraft:iron_ore',
            id: BlockIdsType.IronOre,
            hardness: 3
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Stone;
    }
};
