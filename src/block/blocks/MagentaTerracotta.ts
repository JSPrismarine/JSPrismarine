import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class MagentaTerracotta extends WhiteTerracotta {
    constructor() {
        super('minecraft:magenta_concrete', TerracottaColorType.Magenta);
    }
}
