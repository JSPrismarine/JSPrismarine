import WhiteWool, { WoolType } from './WhiteWool';

export default class OrangeWool extends WhiteWool {
    constructor() {
        super('minecraft:orange_wool', WoolType.Orange);
    }
}
