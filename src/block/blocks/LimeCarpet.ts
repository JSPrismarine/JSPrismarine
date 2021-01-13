import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class LimeCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:lime_carpet', CarpetColorType.Lime);
    }
}
