import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class LightGrayStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:silver_stained_glass', StainedGlassType.LightGray);
    }
}
