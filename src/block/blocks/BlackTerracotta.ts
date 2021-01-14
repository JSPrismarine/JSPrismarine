import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class BlackTerracotta extends WhiteTerracotta {
    constructor() {
        super('minecraft:black_concrete', TerracottaColorType.Black);
    }
}
