import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class Dispenser extends Solid {
    constructor() {
        super({
            name: 'minecraft:dispenser',
            id: BlockIdsType.Dispenser,
            hardness: 3.5
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
