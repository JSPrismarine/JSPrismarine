import WhiteBed, { BedType } from './WhiteBed';

export default class CyanBed extends WhiteBed {
    public constructor() {
        super('minecraft:cyan_bed', BedType.Cyan);
    }
}
