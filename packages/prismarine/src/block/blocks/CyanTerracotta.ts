import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class CyanTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:cyan_terracotta', TerracottaColorType.Cyan);
    }
}
