import StainedGlass, { StainedGlassType } from "./StainedGlass";

export default class LimeStainedGlass extends StainedGlass {
	constructor() {
		super("minecraft:lime_stained_glass", StainedGlassType.Lime);
	}
}
