import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

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
