import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class CyanCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:cyan_carpet', CarpetColorType.Cyan);
    }
}
