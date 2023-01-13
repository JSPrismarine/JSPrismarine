import WhiteBed, { BedType } from './WhiteBed.js';

export default class OrangeBed extends WhiteBed {
    public constructor() {
        super('minecraft:orange_bed', BedType.Orange);
    }
}
