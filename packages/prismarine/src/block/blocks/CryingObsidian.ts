import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

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
