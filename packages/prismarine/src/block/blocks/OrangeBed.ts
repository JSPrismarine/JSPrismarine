import WhiteBed, { BedType } from './WhiteBed';

export default class OrangeBed extends WhiteBed {
    public constructor() {
        super('minecraft:orange_bed', BedType.Orange);
    }
}
