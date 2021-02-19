import WhiteBed, { BedType } from './WhiteBed';

export default class BlueBed extends WhiteBed {
    public constructor() {
        super('minecraft:blue_bed', BedType.Blue);
    }
}
