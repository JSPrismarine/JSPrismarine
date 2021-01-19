import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export enum ConcreteColorType {
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

export default class WhiteConcrete extends Solid {
    public constructor(
        name = 'minecraft:white_concrete',
        type: ConcreteColorType = ConcreteColorType.White
    ) {
        super({
            name,
            id: BlockIdsType.Concrete,
            hardness: 1.8
        });
        this.meta = type;
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }
}
