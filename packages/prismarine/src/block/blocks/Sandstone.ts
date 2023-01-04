import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

export enum SandstoneType {
    Regular = 0,
    Chiseled = 1,
    Cut = 2
}

export default class Sandstone extends Solid {
    public constructor(name = 'minecraft:sandstone', type: SandstoneType = SandstoneType.Regular) {
        super({
            name,
            id: BlockIdsType.Sandstone,
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
