import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class DiamondBlock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:diamond_block',
            id: BlockIdsType.DiamondBlock,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Iron;
    }

    public getBlastResistance() {
        return 6;
    }
}
