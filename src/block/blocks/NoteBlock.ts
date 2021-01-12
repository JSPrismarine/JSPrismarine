import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class NoteBlock extends Solid {
    constructor() {
        super({
            name: 'minecraft:note_block',
            id: BlockIdsType.NoteBlock,
            hardness: 0.8
        });
    }

    getToolType() {
        return BlockToolType.Axe;
    }

    getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }
}
