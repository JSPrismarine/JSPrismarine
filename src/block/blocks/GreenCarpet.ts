import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class GreenCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:green_carpet', CarpetColorType.Green);
    }
}
