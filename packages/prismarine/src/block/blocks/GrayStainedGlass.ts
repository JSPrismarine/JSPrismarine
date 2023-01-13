import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class GrayStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:gray_stained_glass', StainedGlassType.Gray);
    }
}
