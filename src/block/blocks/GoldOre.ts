import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class GoldOre extends Solid {
    constructor() {
        super({
            name: 'minecraft:gold_ore',
            id: BlockIdsType.GoldOre,
            hardness: 3
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Iron;
    }
}
