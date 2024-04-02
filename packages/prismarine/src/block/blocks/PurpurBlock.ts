import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class PurpurBlock extends Solid {
    public constructor() {
        super({
            name: 'minecraft:purpur_block',
            id: BlockIdsType.PurpurBlock,
            hardness: 1.5
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
