import Glass from './Glass';
import { BlockIdsType } from '../BlockIdsType';

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

export default class StainedGlass extends Glass {
    constructor(
        name: string = 'minecraft:stained_glass',
        type: StainedGlassType
    ) {
        super(name, BlockIdsType.StainedGlass);
        this.meta = type;
    }
}
