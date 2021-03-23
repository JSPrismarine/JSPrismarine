import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export enum RedSandstoneType {
    Regular = 0,
    Chiseled = 1,
    Cut = 2
}

export default class RedSandstone extends Solid {
    public constructor(name = 'minecraft:red_sandstone', type: RedSandstoneType = RedSandstoneType.Regular) {
        super({
            name,
            id: BlockIdsType.RedSandstone,
            hardness: 4
        });
        this.meta = type;
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
