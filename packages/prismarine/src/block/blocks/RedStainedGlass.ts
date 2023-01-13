import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class RedStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:red_stained_glass', StainedGlassType.Red);
    }
}
