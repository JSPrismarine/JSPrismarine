import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class BlueCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:blue_carpet', CarpetColorType.Blue);
    }
}
