import WhiteTerracotta, { TerracottaColorType } from './WhiteTerracotta.js';

export default class MagentaTerracotta extends WhiteTerracotta {
    public constructor() {
        super('minecraft:magenta_terracotta', TerracottaColorType.Magenta);
    }
}
