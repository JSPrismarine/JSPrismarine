import WhiteBed, { BedType } from './WhiteBed.js';

export default class RedBed extends WhiteBed {
    public constructor() {
        super('minecraft:Red_bed', BedType.Red);
    }
}
