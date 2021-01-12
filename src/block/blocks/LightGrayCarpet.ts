import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class LightGrayCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:light_gray_carpet', CarpetColorType.LightGray);
    }
}
