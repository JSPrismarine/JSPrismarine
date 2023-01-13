import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class BlackWool extends WhiteWool {
    public constructor() {
        super('minecraft:black_wool', WoolColorType.Black);
    }
}
