import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class OrangeTerracotta extends WhiteTerracotta {
    constructor() {
        super('minecraft:orange_concrete', TerracottaColorType.Orange);
    }
}
