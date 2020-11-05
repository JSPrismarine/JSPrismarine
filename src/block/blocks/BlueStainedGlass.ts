import StainedGlass, { StainedGlassType } from "./StainedGlass";

export default class BlueStainedGlass extends StainedGlass {
    constructor() {
        super("minecraft:blue_stained_glass", StainedGlassType.Blue);
    }
}
