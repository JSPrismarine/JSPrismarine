import WhiteBed, { BedType } from './WhiteBed';

export default class RedBed extends WhiteBed {
    public constructor() {
        super('minecraft:Red_bed', BedType.Red);
    }
}
