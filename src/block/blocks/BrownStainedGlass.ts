import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class BrownStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:brown_stained_glass', StainedGlassType.Brown);
    }
}
