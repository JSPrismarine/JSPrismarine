import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export enum LogType {
    Oak = 0,
    Spruce = 1,
    Birch = 2,
    Jungle = 3,
    Acacia = 4,
    DarkOak = 5
}

export default class Log extends Solid {
    constructor(name = 'minecraft:oak_log', type: LogType = LogType.Oak) {
        super({
            name,
            id: BlockIdsType.Log,
            hardness: 2
        });
        this.meta = type;
    }

    public getToolType() {
        return BlockToolType.Axe;
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }
}
