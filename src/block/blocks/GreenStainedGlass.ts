import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class GreenStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:green_stained_glass', StainedGlassType.Green);
    }
}
