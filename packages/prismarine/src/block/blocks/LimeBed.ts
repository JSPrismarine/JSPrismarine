import WhiteBed, { BedType } from './WhiteBed';

export default class LimeBed extends WhiteBed {
    public constructor() {
        super('minecraft:lime_bed', BedType.Lime);
    }
}
