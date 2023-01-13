import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class MagentaWool extends WhiteWool {
    public constructor() {
        super('minecraft:magenta_wool', WoolColorType.Magenta);
    }
}
