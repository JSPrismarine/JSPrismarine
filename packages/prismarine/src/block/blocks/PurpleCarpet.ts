import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class PurpleCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:purple_carpet', CarpetColorType.Purple);
    }
}
