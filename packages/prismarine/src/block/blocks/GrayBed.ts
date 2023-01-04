import WhiteBed, { BedType } from './WhiteBed.js';

export default class GrayBed extends WhiteBed {
    public constructor() {
        super('minecraft:gray_bed', BedType.Gray);
    }
}
