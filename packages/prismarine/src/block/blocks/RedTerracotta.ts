import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class RedTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:red_terracotta', TerracottaColorType.Red);
    }
}
