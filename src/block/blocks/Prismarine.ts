import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class Prismarine extends Solid {
    constructor() {
        super({
            name: 'minecraft:prismarine',
            id: BlockIdsType.Prismarine,
            hardness: 1.5
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
}
