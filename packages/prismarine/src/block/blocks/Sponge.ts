import { BlockIdsType } from '../BlockIdsType.js';
import Solid from '../Solid.js';

export enum SpongeType {
    Dry = 0,
    Wet = 1
}

export default class Sponge extends Solid {
    public constructor(name = 'minecraft:sponge', type: SpongeType = SpongeType.Dry) {
        super({
            name,
            id: BlockIdsType.Sponge,
            hardness: 0.6
        });
        this.meta = type;
    }
}
