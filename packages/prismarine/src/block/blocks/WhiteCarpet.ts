import { BlockIdsType } from '../BlockIdsType';
import { Solid } from '../Solid';

export enum CarpetColorType {
    White = 0,
    Orange = 1,
    Magenta = 2,
    LightBlue = 3,
    Yellow = 4,
    Lime = 5,
    Pink = 6,
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

export default class WhiteCarpet extends Solid {
    public constructor(name = 'minecraft:white_carpet', type: CarpetColorType = CarpetColorType.White) {
        super({
            name,
            parentName: 'minecraft:carpet',
            id: BlockIdsType.Carpet,
            hardness: 0.1
        });
        this.meta = type;
    }
}
