import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export enum LeavesType {
    Oak = 0,
    Spruce = 1,
    Birch = 2,
    Jungle = 3,
    Acacia = 4,
    DarkOak = 5
}

export default class Leaves extends Solid {
    constructor(name = 'minecraft:leaves', type: LeavesType = LeavesType.Oak) {
        super({
            name,
            id: BlockIdsType.Leaves,
            hardness: 0.2
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Shears;
    }

    getFlammability() {
        return 20;
    }

    getFuelTime() {
        return 300;
    }
}
