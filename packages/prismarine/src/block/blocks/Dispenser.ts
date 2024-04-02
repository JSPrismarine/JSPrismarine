import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { Solid } from '../Solid';

export default class Dispenser extends Solid {
    public constructor() {
        super({
            name: 'minecraft:dispenser',
            id: BlockIdsType.Dispenser,
            hardness: 3.5
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
