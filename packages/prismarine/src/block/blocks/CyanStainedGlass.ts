import StainedGlass, { StainedGlassType } from './WhiteStainedGlass.js';

export default class CyanStainedGlass extends StainedGlass {
    public constructor() {
        super('minecraft:cyan_stained_glass', StainedGlassType.Cyan);
    }
}
