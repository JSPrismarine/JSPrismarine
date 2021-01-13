import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class BlueCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:blue_carpet', CarpetColorType.Blue);
    }
}
