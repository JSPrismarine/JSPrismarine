import WhiteWool, { WoolColorType } from './WhiteWool';

export default class GreenWool extends WhiteWool {
    public constructor() {
        super('minecraft:green_wool', WoolColorType.Green);
    }
}
