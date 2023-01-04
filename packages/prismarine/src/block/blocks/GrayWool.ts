import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class GrayWool extends WhiteWool {
    public constructor() {
        super('minecraft:gray_wool', WoolColorType.Gray);
    }
}
