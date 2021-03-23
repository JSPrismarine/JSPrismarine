import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class Obsidian extends Solid {
    public constructor() {
        super({
            name: 'minecraft:obsidian',
            id: BlockIdsType.Obsidian,
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
