import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class BlueStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:blue_stained_glass', StainedGlassType.Blue);
    }
}
