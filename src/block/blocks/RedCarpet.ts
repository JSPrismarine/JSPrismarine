import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class RedCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:red_carpet', CarpetColorType.Red);
    }
}
