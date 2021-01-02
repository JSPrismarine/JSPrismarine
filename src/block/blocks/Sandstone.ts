import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';

export enum SandstoneType {
    Regular = 0,
    Red = 1
}

export default class Sandstone extends Solid {
    constructor(
        name = 'minecraft:sandstone',
        type: SandstoneType = SandstoneType.Regular
    ) {
        super({
            name,
            id: BlockIdsType.Sandstone,
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
