import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class CryingObsidian extends Solid {
    constructor() {
        super({
            name: 'minecraft:crying_obsidian',
            id: BlockIdsType.CryingObsidian,
            hardness: 35 // 50 in Java Edition
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Diamond;
    }

    getBlastResistance() {
        return 6000;
    }
}
