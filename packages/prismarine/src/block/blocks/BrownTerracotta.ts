import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class BrownTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:brown_terracotta', TerracottaColorType.Brown);
    }
}
