import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class GreenTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:green_terracotta', TerracottaColorType.Green);
    }
}
