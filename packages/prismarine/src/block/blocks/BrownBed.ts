import WhiteBed, { BedType } from './WhiteBed';

export default class BrownBed extends WhiteBed {
    public constructor() {
        super('minecraft:brown_bed', BedType.Brown);
    }
}
