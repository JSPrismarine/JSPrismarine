import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

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
