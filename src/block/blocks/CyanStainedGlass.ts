import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class CyanStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:cyan_stained_glass', StainedGlassType.Cyan);
    }
}
