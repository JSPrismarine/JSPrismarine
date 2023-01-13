import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

export default class NoteBlock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:note_block',
            id: BlockIdsType.NoteBlock,
            hardness: 0.8
        });
    }

    public getToolType() {
        return [BlockToolType.Axe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
