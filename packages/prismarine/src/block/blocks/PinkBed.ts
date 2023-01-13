import WhiteBed, { BedType } from './WhiteBed.js';

export default class PinkBed extends WhiteBed {
    public constructor() {
        super('minecraft:pink_bed', BedType.Pink);
    }
}
