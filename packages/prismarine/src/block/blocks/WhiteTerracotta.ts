import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export enum TerracottaColorType {
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

export default class WhiteTerracotta extends Solid {
    public constructor(name = 'minecraft:white_terracotta', type: TerracottaColorType = TerracottaColorType.White) {
        super({
            name,
            id: BlockIdsType.StainedHardenedClay,
            hardness: 1.25
        });
        this.meta = type;
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
