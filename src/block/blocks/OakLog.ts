import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export enum LogType {
    Oak = 0,
    Spruce = 1,
    Birch = 2,
    Jungle = 3,
    Acacia = 4,
    DarkOak = 5
}

export default class Log extends Solid {
    constructor(name = 'minecraft:log', type: LogType = LogType.Oak) {
        super({
            name,
            id: BlockIdsType.Log,
            hardness: 2
        });
        this.meta = type;
    }

    getToolType() {
        return BlockToolType.Axe;
    }

    getFlammability() {
        return 20;
    }

    getFuelTime() {
        return 300;
    }
}
