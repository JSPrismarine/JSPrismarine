import Sponge, { SpongeType } from './Sponge.js';

export default class WetSponge extends Sponge {
    public constructor() {
        super('minecraft:wet_sponge', SpongeType.Wet);
    }
}
