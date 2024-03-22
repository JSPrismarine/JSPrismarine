import WhiteBed, { BedType } from './WhiteBed';

export default class YellowBed extends WhiteBed {
    public constructor() {
        super('minecraft:yellow_bed', BedType.Yellow);
    }
}
