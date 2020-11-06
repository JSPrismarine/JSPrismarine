import Solid from '../Solid';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class Cobblestone extends Solid {
    constructor() {
        super({
            name: 'minecraft:cobblestone',
            id: BlockIdsType.Cobblestone,
            hardness: 1.5
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
