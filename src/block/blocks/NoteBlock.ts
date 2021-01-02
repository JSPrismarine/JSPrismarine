import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import { BlockToolType } from '../BlockToolType';

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
