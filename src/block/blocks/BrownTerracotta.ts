import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class BrownTerracotta extends WhiteTerracotta {
    constructor() {
        super('minecraft:brown_terracotta', TerracottaColorType.Brown);
    }
}
