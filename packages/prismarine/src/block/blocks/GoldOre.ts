import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { Solid } from '../Solid';

export default class GoldOre extends Solid {
    public constructor() {
        super({
            name: 'minecraft:gold_ore',
            id: BlockIdsType.GoldOre,
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
