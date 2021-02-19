import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class LimeCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:lime_carpet', CarpetColorType.Lime);
    }
}
