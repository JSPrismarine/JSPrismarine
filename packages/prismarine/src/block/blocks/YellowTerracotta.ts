import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class YellowTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:yellow_terracotta', TerracottaColorType.Yellow);
    }
}
