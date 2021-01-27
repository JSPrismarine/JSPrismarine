import WhiteBed, { BedType } from './WhiteBed';

export default class MegentaBed extends WhiteBed {
    public constructor() {
        super('minecraft:magenta_bed', BedType.Magenta);
    }
}
