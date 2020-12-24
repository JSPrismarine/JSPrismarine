import Sand, { SandType } from './Sand';

export default class RedSand extends Sand {
    constructor() {
        super('minecraft:red_sand', SandType.Red);
    }
}
