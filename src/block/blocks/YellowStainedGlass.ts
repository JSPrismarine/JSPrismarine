import StainedGlass, { StainedGlassType } from "./StainedGlass";

export default class YellowStainedGlass extends StainedGlass {
    constructor() {
        super("minecraft:yellow_stained_glass", StainedGlassType.Yellow);
    }
}
