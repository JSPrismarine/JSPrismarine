import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class BlueWool extends WhiteWool {
    public constructor() {
        super('minecraft:blue_wool', WoolColorType.Blue);
    }
}
