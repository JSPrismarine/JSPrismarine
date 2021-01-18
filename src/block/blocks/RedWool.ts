import WhiteWool, { WoolColorType } from './WhiteWool';

export default class RedWool extends WhiteWool {
    public constructor() {
        super('minecraft:red_wool', WoolColorType.Red);
    }
}
