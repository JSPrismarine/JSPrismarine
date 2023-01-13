import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class LimeTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:lime_terracotta', TerracottaColorType.Lime);
    }
}
