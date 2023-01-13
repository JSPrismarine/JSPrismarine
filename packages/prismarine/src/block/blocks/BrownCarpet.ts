import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class BrownCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:brown_carpet', CarpetColorType.Brown);
    }
}
