import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class Obsidian extends Solid {
    constructor() {
        super({
            name: 'minecraft:obsidian',
            id: BlockIdsType.Obsidian,
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
