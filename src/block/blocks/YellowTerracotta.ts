import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class YellowTerracotta extends WhiteTerracotta {
    constructor() {
        super('minecraft:yellow_terracotta', TerracottaColorType.Yellow);
    }
}
