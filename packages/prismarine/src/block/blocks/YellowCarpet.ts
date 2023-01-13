import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class YellowCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:yellow_carpet', CarpetColorType.Yellow);
    }
}
