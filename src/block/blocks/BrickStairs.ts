import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';

export default class BrickStairs extends Solid {
    constructor() {
        super({
            name: 'minecraft:brick_stairs',
            id: BlockIdsType.BrickStairs,
            hardness: 2
        });
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
