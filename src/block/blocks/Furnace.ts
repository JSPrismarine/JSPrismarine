import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';

export default class Furnace extends Solid {
    constructor() {
        super({
            name: 'minecraft:furnace',
            id: BlockIdsType.Furnace,
            hardness: 3.5
        });
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
