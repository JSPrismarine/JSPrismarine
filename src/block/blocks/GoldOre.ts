import Solid from '../Solid';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

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
