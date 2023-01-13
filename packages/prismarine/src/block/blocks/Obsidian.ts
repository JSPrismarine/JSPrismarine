import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

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
