import WhiteBed, { BedType } from './WhiteBed.js';

export default class CyanBed extends WhiteBed {
    public constructor() {
        super('minecraft:cyan_bed', BedType.Cyan);
    }
}
