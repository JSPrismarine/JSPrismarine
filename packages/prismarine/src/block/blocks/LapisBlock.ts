import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

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
