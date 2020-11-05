import StainedGlass, { StainedGlassType } from "./StainedGlass";

export default class PurpleStainedGlass extends StainedGlass {
	constructor() {
		super("minecraft:purple_stained_glass", StainedGlassType.Purple);
	}
}
