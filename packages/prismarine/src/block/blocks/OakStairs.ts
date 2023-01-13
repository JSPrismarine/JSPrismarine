import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

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
