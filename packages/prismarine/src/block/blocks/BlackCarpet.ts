import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class BlackCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:black_carpet', CarpetColorType.Black);
    }
}
