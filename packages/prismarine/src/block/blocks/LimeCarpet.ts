import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class LimeCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:lime_carpet', CarpetColorType.Lime);
    }
}
