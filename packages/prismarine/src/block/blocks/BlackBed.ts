import WhiteBed, { BedType } from './WhiteBed.js';

export default class BlackBed extends WhiteBed {
    public constructor() {
        super('minecraft:black_bed', BedType.Black);
    }
}
