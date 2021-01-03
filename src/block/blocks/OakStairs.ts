import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';

export default class OakStairs extends Solid {
    constructor() {
        super({
            name: 'minecraft:oak_stairs',
            id: BlockIdsType.OakStairs,
            hardness: 2
        });
    }

    public getToolType() {
        return BlockToolType.Axe;
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
