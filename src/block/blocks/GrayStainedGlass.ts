import StainedGlass, { StainedGlassType } from "./StainedGlass";

export default class GrayStainedGlass extends StainedGlass {
    constructor() {
        super("minecraft:gray_stained_glass", StainedGlassType.Gray);
    }
}
