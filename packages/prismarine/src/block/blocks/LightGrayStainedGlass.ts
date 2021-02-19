import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class LightGrayStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:silver_stained_glass', StainedGlassType.LightGray);
    }
}
