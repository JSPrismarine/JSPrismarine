import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class YellowStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:yellow_stained_glass', StainedGlassType.Yellow);
    }
}
