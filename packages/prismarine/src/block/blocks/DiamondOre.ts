import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class DiamondOre extends Solid {
    public constructor() {
        super({
            name: 'minecraft:diamond_ore',
            id: BlockIdsType.DiamondOre,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Iron;
    }
}
