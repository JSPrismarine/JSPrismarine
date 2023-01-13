import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

export default class EndStoneBrickStairs extends Solid {
    public constructor() {
        super({
            name: 'minecraft:end_stone_brick_stairs', // Should be "end_brick_stairs", but we match Java Edition
            id: BlockIdsType.EndStoneBrickStairs,
            hardness: 2
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
