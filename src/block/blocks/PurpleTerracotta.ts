import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class PurpleTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:purple_terracotta', TerracottaColorType.Purple);
    }
}
