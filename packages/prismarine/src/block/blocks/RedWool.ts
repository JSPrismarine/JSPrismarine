import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class RedWool extends WhiteWool {
    public constructor() {
        super('minecraft:red_wool', WoolColorType.Red);
    }
}
