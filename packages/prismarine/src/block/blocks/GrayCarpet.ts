import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class GrayCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:gray_carpet', CarpetColorType.Gray);
    }
}
