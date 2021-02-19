import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class LimeTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:lime_terracotta', TerracottaColorType.Lime);
    }
}
