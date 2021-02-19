import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class PinkTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:pink_terracotta', TerracottaColorType.Pink);
    }
}
