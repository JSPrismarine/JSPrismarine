import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class MagentaTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:magenta_terracotta', TerracottaColorType.Magenta);
    }
}
