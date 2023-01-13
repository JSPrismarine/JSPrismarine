import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class BlackTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:black_terracotta', TerracottaColorType.Black);
    }
}
