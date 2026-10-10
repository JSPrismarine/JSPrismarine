import { BlockIdsType } from '../BlockIdsType';
import type { Item } from '../../item/Item';
import type Server from '../../Server';
import { Solid } from '../Solid';

export enum BedType {
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

export default class WhiteBed extends Solid {
    public constructor(name = 'minecraft:bed', type: BedType = BedType.White) {
        super({
            name,
            // Bedrock has a single bed block; the colour lives in the block entity, not in
            // the state. All sixteen stay distinct blocks here and place as the same state.
            stateName: 'minecraft:bed',
            id: BlockIdsType.Bed,
            hardness: 0.2
        });
        this.meta = type;
    }

    public getDropsForCompatibleTool(item: Item, server: Server) {
        return [server.getItemManager().getItem('minecraft:bed')];
    }
}
