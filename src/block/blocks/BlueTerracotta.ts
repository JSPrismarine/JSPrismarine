import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta';

export default class BlueTerracotta extends WhiteTerracotta {
    constructor() {
        super('minecraft:blue_concrete', TerracottaColorType.Blue);
    }
}
