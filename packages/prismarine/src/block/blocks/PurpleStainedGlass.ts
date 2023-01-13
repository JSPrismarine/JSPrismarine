import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class PurpleStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:purple_stained_glass', StainedGlassType.Purple);
    }
}
