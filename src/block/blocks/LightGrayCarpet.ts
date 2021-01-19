import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class LightGrayCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:light_gray_carpet', CarpetColorType.LightGray);
    }
}
