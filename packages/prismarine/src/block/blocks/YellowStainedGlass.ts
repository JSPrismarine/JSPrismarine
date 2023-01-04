import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class YellowStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:yellow_stained_glass', StainedGlassType.Yellow);
    }
}
