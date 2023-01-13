import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

export default class MossyCobblestone extends Solid {
    public constructor() {
        super({
            name: 'minecraft:mossy_cobblestone',
            id: BlockIdsType.MossyCobblestone,
            hardness: 2
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
