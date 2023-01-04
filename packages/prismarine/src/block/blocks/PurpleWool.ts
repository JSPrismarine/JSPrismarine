import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class PurpleWool extends WhiteWool {
    public constructor() {
        super('minecraft:purple_wool', WoolColorType.Purple);
    }
}
