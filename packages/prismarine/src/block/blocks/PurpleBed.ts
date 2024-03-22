import WhiteBed, { BedType } from './WhiteBed';

export default class PurpleBed extends WhiteBed {
    public constructor() {
        super('minecraft:purple_bed', BedType.Purple);
    }
}
