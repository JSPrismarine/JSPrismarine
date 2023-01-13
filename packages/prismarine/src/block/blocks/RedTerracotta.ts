import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class RedTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:red_terracotta', TerracottaColorType.Red);
    }
}
