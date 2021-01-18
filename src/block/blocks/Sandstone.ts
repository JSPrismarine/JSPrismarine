import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export enum SandstoneType {
    Regular = 0,
    Chiseled = 1,
    Smooth
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

    public getToolType() {
        return BlockToolType.Pickaxe;
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
