import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class YellowWool extends WhiteWool {
    public constructor() {
        super('minecraft:yellow_wool', WoolColorType.Yellow);
    }
}
