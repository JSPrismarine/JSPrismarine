import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export enum WoolType {
    White = 0,
    Orange = 1,
    Magenta = 2,
    LightBlue = 3,
    Yellow = 4,
    Lime = 5,
    Pink = 6,
    LightGray = 8,
    Cyan = 9,
    Purple = 10,
    Blue = 11,
    Brown = 12,
    Green = 13,
    Red = 14,
    Black = 15
}

export default class WhiteWool extends Solid {
    constructor(
        name = 'minecraft:white_wool',
        type: WoolType = WoolType.White
    ) {
        super({
            name,
            id: BlockIdsType.Wool,
            hardness: 0.2
        });
        this.meta = type;
    }
}
