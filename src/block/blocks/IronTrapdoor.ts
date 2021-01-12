import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class IronTrapdoor extends Solid {
    constructor() {
        super({
            name: 'minecraft:iron_trapdoor',
            id: BlockIdsType.IronTrapdoor,
            hardness: 3
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    isTransparent() {
        return true;
    }
}
