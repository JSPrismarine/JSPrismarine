import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class BrownTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:brown_terracotta', TerracottaColorType.Brown);
    }
}
