import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class CyanWool extends WhiteWool {
    public constructor() {
        super('minecraft:cyan_wool', WoolColorType.Cyan);
    }
}
