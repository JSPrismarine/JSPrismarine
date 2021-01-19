import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class LightBlueCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:light_blue_carpet', CarpetColorType.LightBlue);
    }
}
