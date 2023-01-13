import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class BlueTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:blue_terracotta', TerracottaColorType.Blue);
    }
}
