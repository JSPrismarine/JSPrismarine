import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class GrayTerracotta extends WhiteTerracotta {
    constructor() {
        super('minecraft:gray_terracotta', TerracottaColorType.Gray);
    }
}
