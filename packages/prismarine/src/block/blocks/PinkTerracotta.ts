import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class PinkTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:pink_terracotta', TerracottaColorType.Pink);
    }
}
