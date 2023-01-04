import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class GreenCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:green_carpet', CarpetColorType.Green);
    }
}
