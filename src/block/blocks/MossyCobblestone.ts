import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class MossyCobblestone extends Solid {
    constructor() {
        super({
            name: 'minecraft:mossy_cobblestone',
            id: BlockIdsType.MossyCobblestone,
            hardness: 2
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
