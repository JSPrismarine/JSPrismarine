import StainedGlass, { StainedGlassType } from "./StainedGlass";

export default class GreenStainedGlass extends StainedGlass {
	constructor() {
		super("minecraft:green_stained_glass", StainedGlassType.Green);
	}
}
