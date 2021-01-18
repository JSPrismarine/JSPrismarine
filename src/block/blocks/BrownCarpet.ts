import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class BrownCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:brown_carpet', CarpetColorType.Brown);
    }
}
