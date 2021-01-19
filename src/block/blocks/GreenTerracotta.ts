import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class GreenTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:green_terracotta', TerracottaColorType.Green);
    }
}
