import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { Solid } from '../Solid';

export default class OakStairs extends Solid {
    public constructor() {
        super({
            name: 'minecraft:oak_stairs',
            id: BlockIdsType.OakStairs,
            hardness: 2
        });
    }

    public getToolType() {
        return [BlockToolType.Axe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
