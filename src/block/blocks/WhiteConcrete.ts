import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export enum ConcreteColor {
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

export default class Concrete extends Solid {
    constructor(
        name = 'minecraft:white_concrete',
        type: ConcreteColor = ConcreteColor.White
        ) {
        super({
            name,
            id: BlockIdsType.Concrete,
            hardness: 1.8
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }
}
