import WhiteWool, { WoolColorType } from './WhiteWool';

export default class GreenWool extends WhiteWool {
    constructor() {
        super('minecraft:green_wool', WoolColorType.Green);
    }
}
