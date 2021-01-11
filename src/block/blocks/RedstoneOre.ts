import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class RedstoneOre extends Solid {
    constructor() {
        super({
            name: 'minecraft:redstone_ore',
            id: BlockIdsType.RedstoneOre,
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
