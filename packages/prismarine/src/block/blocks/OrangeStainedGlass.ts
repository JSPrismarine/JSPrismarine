import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class OrangeStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:orange_stained_glass', StainedGlassType.Orange);
    }
}
