import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export enum PlanksType {
    Oak = 0,
    Spruce = 1,
    Birch = 2,
    Jungle = 3,
    Acacia = 4,
    DarkOak = 5
}

export default class Planks extends Solid {
    constructor(
        name: string = 'minecraft:planks',
        type: PlanksType = PlanksType.Oak
    ) {
        super({
            name: name,
            id: BlockIdsType.Planks,
            hardness: 2
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Axe;
    }

    getFlammability() {
        return 20;
    }

    getFuelTime() {
        return 300;
    }
}
