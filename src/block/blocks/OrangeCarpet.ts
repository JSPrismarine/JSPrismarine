import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class OrangeCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:orange_carpet', CarpetColorType.Orange);
    }
}
