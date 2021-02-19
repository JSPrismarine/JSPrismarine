import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class BlueCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:blue_carpet', CarpetColorType.Blue);
    }
}
