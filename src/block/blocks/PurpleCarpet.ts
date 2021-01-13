import WhiteCarpet, { CarpetColorType } from './WhiteCarpet';

export default class PurpleCarpet extends WhiteCarpet {
    constructor() {
        super('minecraft:purple_carpet', CarpetColorType.Purple);
    }
}
