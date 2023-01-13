import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

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
