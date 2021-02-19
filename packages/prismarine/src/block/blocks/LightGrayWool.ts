import WhiteWool, { WoolColorType } from './WhiteWool';

export default class LightGrayWool extends WhiteWool {
    public constructor() {
        super('minecraft:light_gray_wool', WoolColorType.LightGray);
    }
}
