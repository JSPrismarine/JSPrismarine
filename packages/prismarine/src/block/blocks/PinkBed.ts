import WhiteBed, { BedType } from './WhiteBed';

export default class PinkBed extends WhiteBed {
    public constructor() {
        super('minecraft:pink_bed', BedType.Pink);
    }
}
