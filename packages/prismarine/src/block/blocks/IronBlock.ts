import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { Solid } from '../Solid';

export default class IronBlock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:iron_block',
            id: BlockIdsType.IronBlock,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Stone;
    }

    public getBlastResistance() {
        return 6;
    }
}
