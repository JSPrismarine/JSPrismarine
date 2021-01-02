import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockToolType } from '../BlockToolType';

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

    getBlastResistance() {
        return 6000;
    }
}
