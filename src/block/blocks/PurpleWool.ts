import WhiteWool, { WoolColorType } from './WhiteWool';

export default class PurpleWool extends WhiteWool {
    constructor() {
        super('minecraft:purple_wool', WoolColorType.Purple);
    }
}
