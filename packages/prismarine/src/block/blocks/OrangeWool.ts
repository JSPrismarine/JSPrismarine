import WhiteWool, { WoolColorType } from './WhiteWool';

export default class OrangeWool extends WhiteWool {
    public constructor() {
        super('minecraft:orange_wool', WoolColorType.Orange);
    }
}
