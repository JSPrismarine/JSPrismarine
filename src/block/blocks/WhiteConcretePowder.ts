import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export enum ConcretePowderColor {
    White = 0,
    Orange = 1,
    Magenta = 2,
    lightBlue = 3,
    Yellow = 4,
    Lime = 5,
    pink = 6,
    Gray = 7,
    LightGray = 8,
    Cyan = 9,
    Purple = 10,
    Blue = 11,
    Brown = 12,
    Green = 13,
    Red = 14,
    Black = 15
}

export default class ConcretePowder extends Solid {
    constructor(name = 'minecraft:white_concrete_powder', type: ConcretePowderColor = ConcretePowderColor.White) {
        super({
            name,
            id: BlockIdsType.ConcretePowder,
            hardness: 0.5
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Shovel;
    }
}
