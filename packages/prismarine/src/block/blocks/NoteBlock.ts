import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

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
