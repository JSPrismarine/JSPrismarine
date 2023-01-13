import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

export default class Cobblestone extends Solid {
    public constructor() {
        super({
            name: 'minecraft:cobblestone',
            id: BlockIdsType.Cobblestone,
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
