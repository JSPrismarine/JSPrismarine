import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { Solid } from '../Solid';

export default class CryingObsidian extends Solid {
    public constructor() {
        super({
            name: 'minecraft:crying_obsidian',
            id: BlockIdsType.CryingObsidian,
            hardness: 35 // 50 in Java Edition
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Diamond;
    }

    public getBlastResistance() {
        return 6000;
    }
}
