import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class RedCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:red_carpet', CarpetColorType.Red);
    }
}
