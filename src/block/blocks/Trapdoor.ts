import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class Trapdoor extends Solid {
    constructor() {
        super({
            name: 'minecraft:trapdoor',
            id: BlockIdsType.Trapdoor,
            hardness: 3
        });
    }

    getToolType() {
        return BlockToolType.Axe;
    }

    getFlammability() {
        return 20;
    }

    isTransparent() {
        return true;
    }
}
