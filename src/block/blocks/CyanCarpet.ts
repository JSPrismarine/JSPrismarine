import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class CyanCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:cyan_carpet', CarpetColorType.Cyan);
    }
}
