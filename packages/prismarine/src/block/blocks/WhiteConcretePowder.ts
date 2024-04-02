import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export enum ConcretePowderColorType {
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

export default class WhiteConcretePowder extends Solid {
    public constructor(
        name = 'minecraft:white_concrete_powder',
        type: ConcretePowderColorType = ConcretePowderColorType.White
    ) {
        super({
            name,
            parentName: 'minecraft:concretePowder',
            id: BlockIdsType.ConcretePowder,
            hardness: 0.5
        });
        this.meta = type;
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Shovel];
    }
}
