import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class LightGrayTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:light_gray_terracotta', TerracottaColorType.LightGray);
    }
}
