import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export enum LeavesType {
    Oak = 0,
    Spruce = 1,
    Birch = 2,
    Jungle = 3,
    Acacia = 4,
    DarkOak = 5
}

export default class Leaves extends Solid {
    public constructor(name = 'minecraft:oak_leaves', type: LeavesType = LeavesType.Oak) {
        super({
            name,
            id: BlockIdsType.Leaves,
            hardness: 0.2
        });
        this.meta = type;
    }

    public getToolType() {
        return [BlockToolType.Shears];
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }
}
