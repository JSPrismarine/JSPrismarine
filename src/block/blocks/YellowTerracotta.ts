import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class YellowTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:yellow_terracotta', TerracottaColorType.Yellow);
    }
}
