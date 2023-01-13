import WhiteCarpet, { CarpetColorType } from './WhiteCarpet.js';

export default class MagentaCarpet extends WhiteCarpet {
    public constructor() {
        super('minecraft:magenta_carpet', CarpetColorType.Magenta);
    }
}
