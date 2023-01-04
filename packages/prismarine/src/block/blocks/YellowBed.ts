import WhiteBed, { BedType } from './WhiteBed.js';

export default class YellowBed extends WhiteBed {
    public constructor() {
        super('minecraft:yellow_bed', BedType.Yellow);
    }
}
