import StainedGlass, { StainedGlassType } from './StainedGlass';

export default class RedStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:red_stained_glass', StainedGlassType.Red);
    }
}
