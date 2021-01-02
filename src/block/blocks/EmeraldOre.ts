import Solid from '../Solid';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class EmeraldOre extends Solid {
    constructor() {
        super({
            name: 'minecraft:emerald_ore',
            id: BlockIdsType.EmeraldOre,
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
