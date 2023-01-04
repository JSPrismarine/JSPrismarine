import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

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
