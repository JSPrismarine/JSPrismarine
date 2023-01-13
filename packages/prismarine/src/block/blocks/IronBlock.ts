import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

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
