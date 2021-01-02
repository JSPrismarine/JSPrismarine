import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class MagentaStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:magenta_stained_glass', StainedGlassType.Magenta);
    }
}
