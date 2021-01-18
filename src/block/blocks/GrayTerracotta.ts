import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class GrayTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:gray_terracotta', TerracottaColorType.Gray);
    }
}
