import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class PinkStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:pink_stained_glass', StainedGlassType.Pink);
    }
}
