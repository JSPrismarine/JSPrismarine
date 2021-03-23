import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class GoldBlock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:gold_block',
            id: BlockIdsType.GoldBlock,
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
