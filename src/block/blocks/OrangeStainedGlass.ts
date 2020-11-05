import StainedGlass, { StainedGlassType } from "./StainedGlass";

export default class OrangeStainedGlass extends StainedGlass {
    constructor() {
        super("minecraft:orange_stained_glass", StainedGlassType.Orange);
    }
}
