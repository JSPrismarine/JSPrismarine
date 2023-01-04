import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class LimeWool extends WhiteWool {
    public constructor() {
        super('minecraft:lime_wool', WoolColorType.Lime);
    }
}
