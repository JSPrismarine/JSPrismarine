import { BlockIdsType } from '../BlockIdsType';
import Glass from './Glass';

export enum StainedGlassType {
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

export default class WhiteStainedGlass extends Glass {
    public constructor(name = 'minecraft:white_stained_glass', type: StainedGlassType = StainedGlassType.White) {
        super(name, BlockIdsType.StainedGlass);
        this.meta = type;
    }
}
