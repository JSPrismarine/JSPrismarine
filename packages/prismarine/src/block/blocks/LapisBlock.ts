import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

export default class LapisBlock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:lapis_block',
            id: BlockIdsType.LapisBlock,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Stone;
    }
}
