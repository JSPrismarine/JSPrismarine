import Sponge, { SpongeType } from "./Sponge";

export default class WetSponge extends Sponge {
	constructor() {
		super("minecraft:wet_sponge", SpongeType.Wet);
	}
}
