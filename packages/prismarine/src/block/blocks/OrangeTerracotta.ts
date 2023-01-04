import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class OrangeTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:orange_terracotta', TerracottaColorType.Orange);
    }
}
