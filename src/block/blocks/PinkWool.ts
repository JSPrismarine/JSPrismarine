import WhiteWool, { WoolColorType } from './WhiteWool';

export default class PinkWool extends WhiteWool {
    constructor() {
        super('minecraft:pink_wool', WoolColorType.Pink);
    }
}
