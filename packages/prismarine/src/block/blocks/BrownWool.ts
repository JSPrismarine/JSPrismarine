import WhiteWool, { WoolColorType } from './WhiteWool.js';

export default class BrownWool extends WhiteWool {
    public constructor() {
        super('minecraft:brown_wool', WoolColorType.Brown);
    }
}
