import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';

export enum RedSandstoneType {
    Regular = 0,
    Chiseled = 1,
    Smooth
}

export default class RedSandstone extends Solid {
    constructor(
        name = 'minecraft:red_sandstone',
        type: RedSandstoneType = RedSandstoneType.Regular
    ) {
        super({
            name,
            id: BlockIdsType.RedSandstone,
            hardness: 4
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
