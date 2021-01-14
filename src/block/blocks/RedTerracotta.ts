import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class RedTerracotta extends WhiteTerracotta {
    constructor() {
        super('minecraft:red_concrete', TerracottaColorType.Red);
    }
}
