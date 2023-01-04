import WhiteBed, { BedType } from './WhiteBed.js';

export default class LightGrayBed extends WhiteBed {
    public constructor() {
        super('minecraft:light_gray_bed', BedType.LightGray);
    }
}
