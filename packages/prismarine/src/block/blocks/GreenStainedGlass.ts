import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class GreenStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:green_stained_glass', StainedGlassType.Green);
    }
}
