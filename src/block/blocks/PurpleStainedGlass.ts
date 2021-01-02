import StainedGlass, { StainedGlassType } from './WhiteStainedGlass';

export default class PurpleStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:purple_stained_glass', StainedGlassType.Purple);
    }
}
