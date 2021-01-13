import WhiteWool, { WoolColorType } from './WhiteWool';

export default class BlueWool extends WhiteWool {
    constructor() {
        super('minecraft:blue_wool', WoolColorType.Blue);
    }
}
