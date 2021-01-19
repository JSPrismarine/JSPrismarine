import WhiteWool, { WoolColorType } from './WhiteWool';

export default class PinkWool extends WhiteWool {
    public constructor() {
        super('minecraft:pink_wool', WoolColorType.Pink);
    }
}
