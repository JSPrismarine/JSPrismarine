import Sand, { SandType } from './Sand';
import { BlockIdsType } from '../BlockIdsType';

export default class RedSand extends Sand {
    constructor() {
        super('minecraft:red_sand', SandType.Red);
    }
};
