import WhiteWool, { WoolColorType } from './WhiteWool';

export default class MagentaWool extends WhiteWool {
    public constructor() {
        super('minecraft:magenta_wool', WoolColorType.Magenta);
    }
}
