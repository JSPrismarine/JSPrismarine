import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class BrownStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:brown_stained_glass', StainedGlassType.Brown);
    }
}
