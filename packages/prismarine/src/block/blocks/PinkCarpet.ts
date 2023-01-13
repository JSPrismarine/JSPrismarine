import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class PinkCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:pink_carpet', CarpetColorType.Pink);
    }
}
