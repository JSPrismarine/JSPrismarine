import StainedGlass, { StainedGlassType } from "./StainedGlass";

export default class BlackStainedGlass extends StainedGlass {
    constructor() {
        super("minecraft:black_stained_glass", StainedGlassType.Black);
    }
}
