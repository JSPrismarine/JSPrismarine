import WhiteBed, { BedType } from './WhiteBed.js';

export default class LightBlueBed extends WhiteBed {
    public constructor() {
        super('minecraft:light_blue_bed', BedType.LightBlue);
    }
}
