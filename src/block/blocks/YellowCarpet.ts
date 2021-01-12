import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class YellowCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:yellow_carpet', CarpetColorType.Yellow);
    }
}
