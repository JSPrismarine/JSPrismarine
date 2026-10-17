import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class LightGrayStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:light_gray_stained_glass', StainedGlassType.LightGray);
    }
}
