import WhiteBed, { BedType } from './WhiteBed.js';

export default class LimeBed extends WhiteBed {
    public constructor() {
        super('minecraft:lime_bed', BedType.Lime);
    }
}
