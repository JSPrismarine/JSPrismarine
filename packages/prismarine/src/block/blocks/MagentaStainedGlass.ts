import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class MagentaStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:magenta_stained_glass', StainedGlassType.Magenta);
    }
}
