import StainedGlass, {StainedGlassType} from './StainedGlass';

export default class MagentaStainedGlass extends StainedGlass {
    constructor() {
        super('minecraft:magenta_stained_glass', StainedGlassType.Magenta);
    }
}
