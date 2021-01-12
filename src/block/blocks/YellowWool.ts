import WhiteWool, { WoolColorType } from './WhiteWool';

export default class YellowWool extends WhiteWool {
    constructor() {
        super('minecraft:yellow_wool', WoolColorType.Yellow);
    }
}
