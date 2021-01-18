import WhiteWool, { WoolColorType } from './WhiteWool';

export default class GrayWool extends WhiteWool {
    constructor() {
        super('minecraft:gray_wool', WoolColorType.Gray);
    }
}
