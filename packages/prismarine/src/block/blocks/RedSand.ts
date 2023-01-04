import Sand, { SandType } from './Sand.js';

export default class RedSand extends Sand {
    public constructor() {
        super('minecraft:red_sand', SandType.Red);
    }
}
