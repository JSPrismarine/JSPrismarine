import WhiteBed, { BedType } from './WhiteBed';

export default class GreenBed extends WhiteBed {
    public constructor() {
        super('minecraft:green_bed', BedType.Green);
    }
}
