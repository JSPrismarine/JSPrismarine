import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class PinkCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:pink_carpet', CarpetColorType.Pink);
    }
}
